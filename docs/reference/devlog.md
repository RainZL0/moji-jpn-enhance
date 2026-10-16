# Dev Log

What was done and why, newest first. Unfinished work is in [../roadmap.md](../roadmap.md).

## 2026-10-17: Focus on the MOJi extension, new history on GitHub

Removed the stream subtitles and the notes on them because that way of studying is no longer used. Removed the local read-aloud web page and the server parts only it used (subtitle routes, `/api/furigana`, `/api/cache`, serving the built page), because the extension is now the one thing being developed. The personal notes (grammar notes, exported chats, word lists) moved to the ignored `private/notes/`.

The git history was restarted as one commit so that the subtitles and personal notes are not published, and the repository went to GitHub with `master` protected (pull requests with squash merge only). A bundle of the old history, with the web page and the subtitles, is kept locally in `private/backup/`; `git clone <bundle>` opens it.

Moved `tts-web/extension`, `server` and `tests` to the repository root, and the docs from `docs/tts-web/` into `docs/` with a `reference/` level for details. `happy-dom` for the DOM tests now comes from a small root `package.json` instead of the web page's packages. Wrote the doc rules in [../conventions.md](../conventions.md), cut `CLAUDE.md` to a pointer, and added a lychee link check to `test.ps1`.

## 2026-10-01: Everything in English

Docs, code comments, UI text, error messages and tests were rewritten in English; only the Japanese being studied stays. The pattern explanations moved from `zh.json` to `en.json`, the default `lang` became `en`, and Google and Bing translate into English. Text that matches MOJi's own Chinese page (`日语` in `moji-frame.js`) was left alone on purpose.

## 2026-09-30: Player, page boundary and refresh wait

Removed the floating 「読」, 「点」 and 「↻」 buttons and the text-click interception from other MOJi pages, as asked. The player moved to the bottom of the study page, with previous, next, repeat count and loop. Switching sentences cancels old generation, audio or pause, so old timing cannot linger.

Every open of the study page used to load both hidden MOJi pages (`/trans` and `/ana`), which kept Chrome's spinner turning after the content was shown. Now a bridge page is created only when a result is needed, then reused. With fake bridge pages delayed by 1.2 seconds, the page load went from 1331 ms with two frames to 59 ms with none. This shows the mechanism; the real MOJi stall was not captured.

The tool was also copied into a standalone repository (now `../moji-study-standalone-copy`), where the teaching data was rewritten; see the first item of the roadmap.

## 2026-09-29: Study page and sentence patterns

Added the read-aloud study page: the local dictionary gives words and readings first, MOJi adds phrase breaks and meanings, and Google/Bing translation avoids spending MOJi points. Added the first-address and per-tab memory because MOJi removes the hash, which stopped the page from opening directly or surviving a refresh. The sentence patterns grew to cover N5 to N1 plus spoken forms and comparisons of easily confused ones.

## 2026-09-28: Server and tests

Built the edge-tts server with a cache by text, voice and options (60 days, 1000 MB by default), split into config, speech, words, translation and sentence-pattern modules. Split the extension's text handling into `grammar.js`, `study-text.js` and `study-card.js`, and added `test.ps1` to run every check and stop on the first failure.
