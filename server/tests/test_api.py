"""The HTTP routes that work without the internet (no speech, no translation), called through
FastAPI's test client."""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from app import app

    return TestClient(app)


def test_analyze_offsets_are_utf16(client):
    # An emoji is one character in Python but two UTF-16 units in JavaScript.
    words = client.post("/api/analyze", json={"text": "😀食べる"}).json()
    eat = next(w for w in words if w["surface"].startswith("食"))
    assert eat["start"] == 2
    assert eat["ruby"] == [[2, 3, "た"]]


def test_analyze(client):
    words = client.post("/api/analyze", json={"text": "本を読んでいる"}).json()
    assert [w["surface"] for w in words] == ["本", "を", "読ん", "で", "いる"]
    assert words[2]["lemma"] == "読む" and words[2]["cType"].startswith("五段")


def test_grammar(client):
    body = client.post("/api/grammar", json={"text": "本を読んでいる"}).json()
    found = {f["id"]: f for f in body["found"]}
    assert "te-iru" in found and found["te-iru"]["end"] == 7
    assert body["patterns"]["te-iru"]["meaning"]


def test_audio_id_is_checked(client):
    assert client.get("/api/audio/nothex.mp3").status_code == 400
