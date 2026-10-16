# Testing

How to run the full check and each part alone, what each test file covers, and what still needs a manual check.

## Full check

Run `./test.ps1` in the repository folder. It installs the Node packages if needed (`happy-dom`, for the DOM tests), then runs the server tests, the Python style check, the extension syntax check, the extension tests and the doc link check, and stops at the first failure.

The chain tests need the server, so start it in a second terminal first (`./start.ps1`). If it is not on `http://localhost:8000`, set `$env:TTS_SERVER` before running the check. Without a server the chain tests are skipped and the check still passes, so read the output before calling a run complete.

## Parts alone

| Part | Command, from the repository folder |
|:--|:--|
| Server tests | `uv run --project server --directory server pytest -q` |
| Python style | `uvx ruff check server` and `uvx ruff format --check server` |
| One extension file's syntax | `node --check extension/<file>.js` |
| Extension tests | `npm test` (or `node --test "tests/extension/*.test.js"`) |
| Local doc links | `lychee --offline .` |
| Web links too | `lychee .` |

## Server tests

They need neither the internet nor a running server.

- `test_api.py`: the analyze and grammar routes, UTF-16 offsets, the audio id check.
- `test_helpers.py`: kana conversion, okurigana splitting, splitting translation requests.
- `test_grammar.py`: every pattern is found in its own examples and has an explanation; comparisons of easily confused patterns.

## Extension tests

They run with a fake Chrome, fetch, DOM (happy-dom) and audio. Only `chain.test.js` uses the server.

- `labels.test.js`: parts of speech, verb groups, conjugation names.
- `study-text.test.js`: the word-splitting fallback, readings, phrase breaks, translation alignment, word information.
- `background.test.js`: the service error notice; forwarding of reading, sentence switching and practice settings.
- `study-player.test.js`: the control layout, the page boundary, sentence switching, looping, pausing, clearing the time.
- `offscreen.test.js`: cancelling old generation, the navigation boundary, instant repeat and loop, switching while paused, cancelling a pause.
- `study-grammar.test.js`: the teaching fields, examples reading only Japanese, click propagation, missing fields, safe text display.
- `study-load.test.js`: no bridge on restore, the menu observer stopping, creating the bridge on demand and reusing it. Remote iframes, scripts and styles are disabled.
- `chain.test.js`: the breakdown of the parts after a word, on real word splitting from the server.

## Manual checks

When you change the study page layout, load the real extension scripts on a local test page with a fake Chrome API and your own text, and check the display, focus, the console and a narrow window. Test the bridge with fake pages, never with MOJi translation. The real MOJi site, the real voice service and long playback can only be checked by hand.
