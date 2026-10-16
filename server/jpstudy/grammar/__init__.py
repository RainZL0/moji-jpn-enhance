"""Finds grammar patterns (〜ている, 〜なければならない, 〜かもしれない ...) in a text, for the
study page in the browser extension.

The patterns are in patterns.json in this folder; what they mean is in one file per
language (en.json for English), so another language only needs another file.

A pattern is a row of words, written like this:

    "l=て&p=助詞 l=居る"

Words are separated by spaces. Each word lists what it must be, joined by "&":
    s=  the word as written in the text         l=  its dictionary form (UniDic lemma: 居る)
    b=  its dictionary form as written (いる)     p=  word class, from the start (助詞,接続助詞)
    f=  conjugated form, from the start (仮定形)  t=  conjugation type, from the start (五段)
    x   (no "=") any of s, l or b is x
"|" gives choices (l=良い|宜しい), "!" in front means "must not be" (!s=に).
A word starting with "?" may be left out. A word starting with "~" is only checked, not
counted as part of the pattern: "~!l=為る" means the next word must not be する (or there is
none). "…" stands for up to 10 other words of the same sentence, "*" for exactly one word.
"match" may also be a list of such rows, for patterns written in more than one way.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

HERE = Path(__file__).parent  # patterns.json and one <language>.json of explanations per language
GAP = 10  # most words "…" can stand for
KEYS = {"s": "surface", "l": "lemma", "b": "base", "p": "pos", "f": "cForm", "t": "cType"}
PREFIX = {"p", "f", "t"}  # compared from the start


def _condition(text: str):
    negate = text.startswith("!")
    # Choices, each with its key: "p=動詞|形容詞|s=の" is (p, 動詞), (p, 形容詞), (s, の).
    choices, key = [], ""
    for c in text.lstrip("!").split("|"):
        k, eq, v = c.partition("=")
        if eq:
            if k not in KEYS:
                raise ValueError(f"unknown key {k!r} in {text!r}")
            key, c = k, v
        choices.append((key, c))

    def one(w: dict, key: str, value: str) -> bool:
        if not key:
            return value in (w["surface"], w["lemma"], w["base"])
        v = ",".join(w["pos"]) if key == "p" else w[KEYS[key]]
        return v.startswith(value) if key in PREFIX else v == value

    return lambda w: any(one(w, k, v) for k, v in choices) != negate


def _row(text: str) -> list[tuple[str, object]]:
    """A pattern row as a list of steps: ("word", test), ("maybe", test), ("peek", test),
    ("gap", None), ("any", None)."""
    steps = []
    for part in text.split():
        if part == "…":
            steps.append(("gap", None))
        elif part == "*":
            steps.append(("any", None))
        else:
            kind = {"?": "maybe", "~": "peek"}.get(part[0], "word")
            tests = [_condition(c) for c in part.lstrip("?~").split("&")]
            steps.append((kind, lambda w, tests=tests: all(t(w) for t in tests)))
    return steps


def _ends_sentence(w: dict) -> bool:
    return w["pos"][:2] == ["補助記号", "句点"] or w["surface"] in ("。", "！", "？", "!", "?")


def _match(steps, words, at: int, k: int = 0, used: tuple = ()) -> tuple | None:
    """The indexes of the words that make up the pattern when it starts at words[at], or None."""
    if k == len(steps):
        return used
    kind, test = steps[k]
    if kind == "gap":
        for skip in range(GAP + 1):
            j = at + skip
            if j > len(words) or any(_ends_sentence(w) for w in words[at:j]):
                break
            found = _match(steps, words, j, k + 1, used)
            if found is not None:
                return found
        return None
    if kind == "peek":
        if at < len(words) and not test(words[at]):
            return None
        return _match(steps, words, at, k + 1, used)
    if kind == "maybe":
        if at < len(words) and test(words[at]):
            found = _match(steps, words, at + 1, k + 1, used + (at,))
            if found is not None:
                return found
        return _match(steps, words, at, k + 1, used)
    if at >= len(words) or _ends_sentence(words[at]):
        return None
    if kind == "any" or test(words[at]):
        return _match(steps, words, at + 1, k + 1, used + (at,))
    return None


@lru_cache(maxsize=1)
def patterns() -> tuple[dict, ...]:
    out = []
    for p in json.loads((HERE / "patterns.json").read_text(encoding="utf-8")):
        rows = p["match"] if isinstance(p["match"], list) else [p["match"]]
        out.append({**p, "rows": [_row(r) for r in rows]})
    return tuple(out)


@lru_cache(maxsize=8)
def explanations(lang: str) -> dict:
    path = HERE / f"{lang}.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}


def find(words: list[dict] | tuple[dict, ...]) -> list[dict]:
    """Every pattern found in `words` (as given by app._analyze): [{"id", "words": [indexes]}].
    A pattern found inside a longer one (〜ても inside 〜てもいい) is left out."""
    found = []
    for p in patterns():
        for at in range(len(words)):
            for steps in p["rows"]:
                used = _match(steps, words, at)
                if used:
                    found.append({"id": p["id"], "words": list(used)})
                    break
    # One pattern per set of words, and none whose words all belong to a bigger one.
    sets = [set(f["words"]) for f in found]
    keep, seen = [], set()
    for f, s in zip(found, sets):
        key = (f["id"], tuple(f["words"]))
        if key in seen or any(s < other for other in sets):
            continue
        seen.add(key)
        keep.append(f)
    keep.sort(key=lambda f: (f["words"][0], -len(f["words"])))
    return keep


def describe(ids, lang: str = "en") -> dict:
    """What the patterns with these ids mean, in `lang` (English if that language is missing)."""
    words = explanations(lang) or explanations("en")
    by_id = {p["id"]: p for p in patterns()}
    out = {}
    for i in ids:
        p = by_id[i]
        out[i] = {"level": p["level"], "form": p["form"], "example": p["example"], **words.get(i, {})}
    return out
