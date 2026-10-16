"""Japanese split into words with the local dictionary (MeCab through fugashi, with the
UniDic dictionary), so no network is needed: readings over kanji (furigana), each word's
dictionary form and grammar labels, and the grammar patterns (see grammar/).

All offsets are counted in UTF-16 units, the way JavaScript indexes strings, because the
browser extension uses them directly."""

import re
from functools import lru_cache

from fastapi import APIRouter
from pydantic import BaseModel, Field

from . import grammar
from .config import MAX_TEXT

router = APIRouter()

# Kanji plus the marks that behave like kanji (々 repeat mark, ヶ as in 一ヶ月).
KANJI = r"㐀-䶿一-鿿豈-﫿\U00020000-\U0003134f々〆ヵヶ"
KANJI_RE = re.compile(f"[{KANJI}]")
RUN_RE = re.compile(f"[{KANJI}]+|[^{KANJI}]+")

_tagger = None


def _get_tagger():
    # Loaded on first use: the dictionary takes a moment to open.
    global _tagger
    if _tagger is None:
        import fugashi

        _tagger = fugashi.Tagger()
    return _tagger


def hira(s: str) -> str:
    """Katakana to hiragana."""
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def split_okurigana(surface: str, reading: str) -> list[tuple[int, int, str]]:
    """Readings for just the kanji runs of a word, e.g. 食べ + たべ -> [(0, 1, "た")]."""
    runs = RUN_RE.findall(surface)
    pattern = "".join("(.+?)" if KANJI_RE.match(r) else re.escape(hira(r)) for r in runs)
    m = re.fullmatch(pattern, reading)
    if not m:
        return [(0, len(surface), reading)]
    out, pos, g = [], 0, 1
    for r in runs:
        if KANJI_RE.match(r):
            out.append((pos, pos + len(r), m.group(g)))
            g += 1
        pos += len(r)
    return out


def _utf16(text: str):
    return lambda i: len(text[:i].encode("utf-16-le")) // 2


def _feature(w, name: str) -> str:
    v = getattr(w.feature, name, None)
    return "" if v in (None, "*") else str(v)


@lru_cache(maxsize=500)
def words_of(text: str) -> tuple[dict, ...]:
    """Every word of `text` with its reading, dictionary form and grammar labels, for the
    study page in the browser extension. The labels are UniDic's own (in Japanese)."""
    u16 = _utf16(text)
    out, cursor = [], 0
    for w in _get_tagger()(text):
        at = text.find(w.surface, cursor)
        if at < 0:
            continue
        cursor = at + len(w.surface)
        kana = hira(_feature(w, "kana"))
        # UniDic writes the source word of a loanword after the dictionary form:
        # コミュニケーション-communication. Other things after "-" are notes, not words.
        lemma, _, origin = _feature(w, "lemma").partition("-")
        if not re.fullmatch(r"[A-Za-z][A-Za-z '.-]*", origin):
            origin = ""
        ruby = []
        if KANJI_RE.search(w.surface) and kana:
            ruby = [[u16(at + s), u16(at + e), r] for s, e, r in split_okurigana(w.surface, kana)]
        out.append(
            {
                "start": u16(at),
                "end": u16(cursor),
                "surface": w.surface,
                "kana": kana,
                "ruby": ruby,
                "pos": [p for p in (_feature(w, f"pos{i}") for i in range(1, 4)) if p],
                "cType": _feature(w, "cType"),  # conjugation type, e.g. 五段-カ行
                "cForm": _feature(w, "cForm"),  # conjugated form, e.g. 連用形-一般
                "base": _feature(w, "orthBase"),  # dictionary form as written here
                "lemma": lemma,  # dictionary form, usual spelling
                "origin": origin,  # for a loanword, the word it comes from
                "baseKana": hira(_feature(w, "kanaBase")),
                "accent": _feature(w, "aType"),  # pitch accent: the mora after which it drops
            }
        )
    return tuple(out)


class AnalyzeRequest(BaseModel):
    text: str = Field(max_length=MAX_TEXT)


@router.post("/api/analyze")
async def analyze(req: AnalyzeRequest):
    return words_of(req.text)


class GrammarRequest(BaseModel):
    text: str = Field(max_length=MAX_TEXT)
    lang: str = Field("en", pattern=r"^[a-z]{2}(-[A-Za-z]+)?$")  # language of the explanations


@router.post("/api/grammar")
async def find_grammar(req: GrammarRequest):
    """Grammar patterns found in the text: where each one is, by word index as in
    /api/analyze and by UTF-16 offsets, and what each one means."""
    words = words_of(req.text)
    found = [
        {**f, "start": words[f["words"][0]]["start"], "end": words[f["words"][-1]]["end"]} for f in grammar.find(words)
    ]
    return {"found": found, "patterns": grammar.describe({f["id"] for f in found}, req.lang)}
