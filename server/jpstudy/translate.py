"""Japanese to Simplified Chinese for the study page in the browser extension.

These are the free services behind the Google Translate and Bing Translator web pages (no
account or key), so they may change without notice, like edge-tts itself."""

import re
import time
from typing import Literal

import aiohttp
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)
TRANSLATE_CHUNK = 900  # characters per request; Bing takes at most 1000
_translations: dict[tuple[str, str], str] = {}  # (service, text) -> translation
_bing: dict = {}  # what the Bing Translator page hands out: IG, IID, key, token, expires


async def _google(session: aiohttp.ClientSession, text: str) -> str:
    async with session.post(
        "https://translate.googleapis.com/translate_a/single",
        params={"client": "gtx", "sl": "ja", "tl": "en", "dt": "t"},
        data={"q": text},
    ) as r:
        r.raise_for_status()
        data = await r.json(content_type=None)
    return "".join(part[0] for part in data[0] if part and part[0])


async def _bing_pass(session: aiohttp.ClientSession) -> dict:
    # The translator page carries a pass that is good for about an hour.
    if _bing.get("expires", 0) > time.time():
        return _bing
    async with session.get("https://www.bing.com/translator") as r:
        r.raise_for_status()
        html = await r.text()
    ig = re.search(r'IG:"([^"]+)"', html)
    iid = re.search(r'data-iid="([^"]+)"', html)
    ab = re.search(r'params_AbusePreventionHelper\s*=\s*\[(\d+),"([^"]+)",(\d+)', html)
    if not ig or not ab:
        raise RuntimeError(
            "The Bing Translator page has changed, so the parameters needed for translating could not be read"
        )
    _bing.update(
        ig=ig.group(1),
        iid=iid.group(1) if iid else "translator.5028",
        key=ab.group(1),
        token=ab.group(2),
        expires=time.time() + min(int(ab.group(3)) / 1000, 3600) - 120,
    )
    return _bing


async def _bing_translate(session: aiohttp.ClientSession, text: str, retry: bool = True) -> str:
    p = await _bing_pass(session)
    async with session.post(
        "https://www.bing.com/ttranslatev3",
        params={"isVertical": "1", "IG": p["ig"], "IID": p["iid"] + ".1"},
        data={"fromLang": "ja", "to": "en", "text": text, "token": p["token"], "key": p["key"]},
    ) as r:
        data = await r.json(content_type=None) if r.status == 200 else None
    if not isinstance(data, list):  # the pass ran out early: get a new one, once
        _bing.clear()
        if retry:
            return await _bing_translate(session, text, retry=False)
        raise RuntimeError("Bing Translator gave no result")
    return data[0]["translations"][0]["text"]


def chunks(lines: list[str]) -> list[list[str]]:
    """The lines in groups of at most TRANSLATE_CHUNK characters (a longer line goes alone)."""
    out, size = [[]], 0
    for line in lines:
        if out[-1] and size + len(line) > TRANSLATE_CHUNK:
            out.append([])
            size = 0
        out[-1].append(line)
        size += len(line) + 1
    return out


class TranslateRequest(BaseModel):
    lines: list[str] = Field(max_length=500)
    service: Literal["google", "bing"] = "google"


@router.post("/api/translate")
async def translate(req: TranslateRequest):
    """Line by line: {"lines": [...]} in the same order. Lines are sent a few at a time,
    joined by line breaks, which both services keep."""
    one = _google if req.service == "google" else _bing_translate
    lines = [" ".join(line.split()) for line in req.lines]
    todo = [line for line in dict.fromkeys(lines) if line and (req.service, line) not in _translations]
    try:
        async with aiohttp.ClientSession(
            trust_env=True, headers={"User-Agent": BROWSER_UA}, timeout=aiohttp.ClientTimeout(total=20)
        ) as session:
            for chunk in chunks(todo):
                got = (await one(session, "\n".join(chunk))).split("\n")
                if len(got) != len(chunk):  # the lines got merged or split: one at a time
                    got = [await one(session, line) for line in chunk]
                for src, dst in zip(chunk, got):
                    _translations[(req.service, src)] = dst.strip()
    except Exception as e:
        name = "Google" if req.service == "google" else "Bing"
        raise HTTPException(502, f"{name} translation failed: {e}") from e
    if len(_translations) > 5000:
        _translations.clear()
    return {"lines": [_translations.get((req.service, line), "") for line in lines]}
