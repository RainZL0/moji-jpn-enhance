# Server API

Every route of the local server, with its fields, limits and return values. The code is in `server/jpstudy/`; the default address is `http://localhost:8000`. Everything except the MP3 is JSON, and a failed field check returns 422. When you change a route, update this page and `server/tests/test_api.py` together.

## Voices and speech

`GET /api/voices` returns the voice list. Each item has `id`, `name`, `locale`, `localeName`, `gender` and `personalities`.

`POST /api/synthesize` takes a non-empty `text` (up to 3000 characters), `voice` (default `ja-JP-NanamiNeural`), `rate` (percent, -80 to 200), `pitch` (Hz, -100 to 100) and `volume` (percent, -80 to 100):

```json
{ "text": "窓を開けてください。", "voice": "ja-JP-NanamiNeural", "rate": 0, "pitch": 0, "volume": 0 }
```

It returns `id`, `request`, `duration`, `words`, `bytes`, `created` and `cached`. `duration` and each word's `start` and `end` are in milliseconds; a word is `{text, start, end}`. The duration is estimated from the MP3's size. The same request reuses the cache. A failure returns 502.

`GET /api/audio/{id}.mp3` returns the MP3. The id is 20 hexadecimal digits; a bad id returns 400 and a missing clip 404.

The cache is in `server/cache/`. Clips unused for 60 days are deleted, and the least recently used go first when the cache passes 1000 MB; `TTS_CACHE_DAYS` and `TTS_CACHE_MAX_MB` change these. A deleted clip is made again when asked for. If speech keeps failing, Microsoft may have changed its service: run `uv add -U edge-tts` in `server/` and restart.

## Words and sentence patterns

`POST /api/analyze` takes `text` (up to 3000 characters) and returns the words: `start`, `end`, `surface`, `kana`, `ruby`, `pos`, `cType`, `cForm`, `base`, `lemma`, `origin`, `baseKana` and `accent`. Positions are UTF-16 offsets. The part-of-speech and conjugation labels are UniDic's own Japanese wording.

`POST /api/grammar` takes `text` (up to 3000 characters) and `lang` (default `en`). It returns `found` (each with the pattern `id`, the word indexes `words`, and `start` and `end` in the text) and `patterns` (the explanation of each found pattern by id). How patterns are written is in [grammar-patterns.md](grammar-patterns.md).

## Translation

`POST /api/translate` takes `lines` (up to 500) and `service` (`google` or `bing`) and returns the translated `lines` in the same order. It uses the free services behind those sites' web pages, so a change on their side can break it. MOJi translation does not go through this route.
