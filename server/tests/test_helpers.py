"""Small helpers that need neither the dictionary nor the internet."""

from jpstudy import translate
from jpstudy.words import hira, split_okurigana


def test_hira():
    assert hira("カタカナとひらがな") == "かたかなとひらがな"


def test_split_okurigana():
    assert split_okurigana("食べ", "たべ") == [(0, 1, "た")]
    assert split_okurigana("取り扱い", "とりあつかい") == [(0, 1, "と"), (2, 3, "あつか")]
    # When the reading does not fit, the whole word gets it.
    assert split_okurigana("明日", "あす") == [(0, 2, "あす")]


def test_chunks(monkeypatch):
    monkeypatch.setattr(translate, "TRANSLATE_CHUNK", 5)
    assert translate.chunks(["ab", "cd", "efghij", "k"]) == [["ab", "cd"], ["efghij"], ["k"]]
