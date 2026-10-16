# Architecture

The parts of the project, how data flows between them, and the rules that keep them apart. File-level detail is in [reference/](reference/README.md).

## Parts

| Path | What it is |
|:--|:--|
| `extension/` | The Chrome extension: the study page inside MOJi, background audio playback, the popup and the right-click entry. See [extension-internals.md](reference/extension-internals.md). |
| `server/` | A FastAPI server on the local machine. `app.py` puts the routers together; `jpstudy/speech.py` makes speech with edge-tts and caches it, `jpstudy/words.py` splits words with MeCab and UniDic, `jpstudy/translate.py` calls Google or Bing, `jpstudy/grammar/` finds sentence patterns, and `jpstudy/config.py` holds paths and limits. See [server-api.md](reference/server-api.md). |
| `tests/extension/`, `server/tests/` | Tests. See [testing.md](reference/testing.md). |
| `start.ps1`, `test.ps1` | Start the server; run every test and check. |

## Data flow

Speech: the extension sends `POST /api/synthesize` and gets back an audio id, the length and the time of each word, then fetches the MP3 from `GET /api/audio/{id}.mp3`. The same text, voice and options reuse the cache. The audio plays in the extension's offscreen page (a hidden extension page that may play sound), so switching tabs or closing the popup does not stop it.

Analysis: the local dictionary gives the words and readings (`/api/analyze`), the sentence-pattern API finds the patterns and their explanations (`/api/grammar`), and a hidden MOJi page, created only when needed, adds phrase breaks, meanings and readings. Google/Bing translation goes through the local server (`/api/translate`); only MOJi translation uses a hidden MOJi translation page and the user's points.

What needs the internet: speech (Microsoft's service), Google/Bing translation, and everything from MOJi. Word splitting and sentence patterns work offline.

## Rules

- The server has no login and no origin check. It is for the local machine only and must not be exposed as a public service.
- Text positions are UTF-16 offsets everywhere (server, extension, highlighting), so JavaScript can slice strings directly.
- The study content and the player belong to the study page. Other MOJi pages get only the sidebar entry: no floating buttons and no taking over text clicks.
- The extension never calls MOJi's login-protected APIs itself. A hidden MOJi page sends its own request and the extension reads the result. Login data must never reach logs, docs, test output or any other service.
- Sentence-pattern detection rules and teaching text are kept apart. When the program misses something, add a detection hint; do not bend the explanation of Japanese to suit the program.
