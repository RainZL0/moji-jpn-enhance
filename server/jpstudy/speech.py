"""Speech: the list of voices, turning text into speech with edge-tts (Microsoft Edge's
online "Read Aloud" voices), and the cache of every clip made."""

import asyncio
import hashlib
import json
import os
import re
import time

import edge_tts
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .config import CACHE_DAYS, CACHE_DIR, CACHE_MAX_MB, MAX_TEXT, PRUNE_EVERY

router = APIRouter()

TICKS_PER_MS = 10_000  # edge-tts offsets are in 100-nanosecond units

# At most a few requests to Microsoft at once, so we don't get throttled.
_upstream = asyncio.Semaphore(4)
# One in-flight synthesis per cache key; duplicate requests wait for the first.
_inflight: dict[str, asyncio.Lock] = {}


# ---------------------------------------------------------------- voices

_voices_cache: list[dict] | None = None


@router.get("/api/voices")
async def voices():
    global _voices_cache
    if _voices_cache is None:
        try:
            raw = await edge_tts.list_voices()
        except Exception as e:  # network down, service changed, ...
            raise HTTPException(502, f"Could not get the voice list: {e}") from e
        _voices_cache = [
            {
                "id": v["ShortName"],
                "name": v["ShortName"].split("-", 2)[-1].removesuffix("Neural"),
                "locale": v["Locale"],
                "localeName": v.get("LocaleName", v["Locale"]),
                "gender": v["Gender"],
                "personalities": v.get("VoiceTag", {}).get("VoicePersonalities", []),
            }
            for v in raw
        ]
    return _voices_cache


# ---------------------------------------------------------------- synthesis


class SynthRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT)
    voice: str = "ja-JP-NanamiNeural"
    rate: int = Field(0, ge=-80, le=200, description="percent")
    pitch: int = Field(0, ge=-100, le=100, description="Hz")
    volume: int = Field(0, ge=-80, le=100, description="percent")


def _signed(n: int, unit: str) -> str:
    return f"{'+' if n >= 0 else ''}{n}{unit}"


def _key(req: SynthRequest) -> str:
    blob = json.dumps(req.model_dump(), ensure_ascii=False, sort_keys=True)
    return hashlib.sha1(blob.encode()).hexdigest()[:20]


async def _synthesize(req: SynthRequest, key: str) -> dict:
    comm = edge_tts.Communicate(
        req.text,
        req.voice,
        rate=_signed(req.rate, "%"),
        pitch=_signed(req.pitch, "Hz"),
        volume=_signed(req.volume, "%"),
        boundary="WordBoundary",
    )
    audio = bytearray()
    words = []
    async with _upstream:
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                audio += chunk["data"]
            elif chunk["type"] == "WordBoundary":
                start = chunk["offset"] / TICKS_PER_MS
                words.append(
                    {
                        "text": chunk["text"],
                        "start": round(start),
                        "end": round(start + chunk["duration"] / TICKS_PER_MS),
                    }
                )
    if not audio:
        raise HTTPException(502, "The service returned no audio. The text may have nothing that can be read aloud.")
    # 24 kHz mono MP3 at 48 kbit/s -> 6 bytes per millisecond.
    meta = {
        "id": key,
        "request": req.model_dump(),
        "words": words,
        "duration": round(len(audio) / 6),
        "bytes": len(audio),
        "created": time.time(),
    }
    (CACHE_DIR / f"{key}.mp3").write_bytes(audio)
    (CACHE_DIR / f"{key}.json").write_text(json.dumps(meta, ensure_ascii=False), "utf-8")
    return meta


@router.post("/api/synthesize")
async def synthesize(req: SynthRequest):
    req.text = req.text.strip()
    if not req.text:
        raise HTTPException(422, "The text is empty")
    key = _key(req)
    meta_path = CACHE_DIR / f"{key}.json"
    lock = _inflight.setdefault(key, asyncio.Lock())
    async with lock:
        if meta_path.exists() and (CACHE_DIR / f"{key}.mp3").exists():
            _touch(key)
            return {**json.loads(meta_path.read_text("utf-8")), "cached": True}
        try:
            meta = await _synthesize(req, key)
        except HTTPException:
            raise
        except edge_tts.exceptions.NoAudioReceived as e:
            raise HTTPException(502, "The service returned no audio. Check the text or the voice settings.") from e
        except Exception as e:
            raise HTTPException(
                502,
                f"Generation failed: {type(e).__name__}: {e}. "
                "If it keeps failing, Microsoft may have changed the interface. Try upgrading edge-tts (uv add -U edge-tts).",
            ) from e
        finally:
            _inflight.pop(key, None)
    return {**meta, "cached": False}


@router.get("/api/audio/{key}.mp3")
async def audio(key: str):
    if not re.fullmatch(r"[0-9a-f]{20}", key):
        raise HTTPException(400, "bad id")
    path = CACHE_DIR / f"{key}.mp3"
    if not path.exists():
        raise HTTPException(404, "The audio is not in the cache. Please generate it again")
    _touch(key)
    return FileResponse(path, media_type="audio/mpeg", headers={"Cache-Control": "max-age=31536000, immutable"})


# ---------------------------------------------------------------- the cache


def _touch(key: str) -> None:
    # The .json file's modified time records when the clip was last used.
    try:
        os.utime(CACHE_DIR / f"{key}.json")
    except OSError:
        pass


def prune() -> int:
    """Delete clips unused for CACHE_DAYS, then the least recently used ones over CACHE_MAX_MB."""
    clips: dict[str, dict] = {}
    for f in CACHE_DIR.iterdir():
        if f.suffix in (".mp3", ".json"):
            c = clips.setdefault(f.stem, {"files": [], "used": None, "bytes": 0})
            c["files"].append(f)
            st = f.stat()
            c["bytes"] += st.st_size
            if f.suffix == ".json":
                c["used"] = st.st_mtime
    now = time.time()
    for c in clips.values():
        if len(c["files"]) < 2:
            # Only half a clip: useless, unless it is still being written right now.
            born = min(f.stat().st_mtime for f in c["files"])
            c["used"] = 0 if now - born > 600 else now
    order = sorted(clips.values(), key=lambda c: c["used"])
    total = sum(c["bytes"] for c in order)
    cutoff = now - CACHE_DAYS * 86400
    deleted = 0
    for c in order:
        if c["used"] >= cutoff and total <= CACHE_MAX_MB * 1024 * 1024:
            break
        try:
            for f in c["files"]:
                f.unlink(missing_ok=True)
        except OSError:  # e.g. being sent to a browser right now (Windows locks it); try next time
            continue
        total -= c["bytes"]
        deleted += 1
    return deleted


async def prune_forever():
    """Runs for as long as the server does (started in app.py)."""
    while True:
        try:
            n = await asyncio.to_thread(prune)
            if n:
                print(f"Cache cleanup: deleted {n} expired or surplus audio files")
        except Exception as e:  # noqa: BLE001  (never let cleanup take the server down)
            print(f"Cache cleanup failed: {e}")
        await asyncio.sleep(PRUNE_EVERY)
