# Extension Internals

How the scripts in `extension/` divide the work, how playback is coordinated, how the hidden MOJi bridge works, and what is saved where. How to use the extension is in [../usage.md](../usage.md).

## Scripts

On MOJi pages the manifest loads `content.js`, `grammar.js`, `study-text.js`, `study-grammar.js`, `study-card.js` and `study.js`, in that order, at `document_idle`. `background.js` injects the same list again after an update, so a new script must be added in both places. A newly loaded script cleans up the old study page, observers and bridge nodes through the `moji-tts-replace` event.

- `content.js`: collects text, highlights the word being read, and runs the study page's bottom player. It gets the page state, the text and the mount point through `mojiTts.study`.
- `grammar.js`: part-of-speech and conjugation names and the breakdown of the parts attached after a word. It also runs alone in Node for tests.
- `study-text.js`: rough word splitting, readings, phrase breaks, translation alignment, word levels.
- `study-grammar.js`: the sentence-pattern details and example buttons, shared by the list and the cards. Missing fields show nothing.
- `study-card.js`: the hover cards for words and sentence patterns.
- `study.js`: the study page itself (its sidebar entry, input, results, translation, display settings, saving) and the player's mount point. It knows it should open from `#tts-study`, from the first address of the tab, or from the `sessionStorage` flag kept for refreshes (MOJi removes the hash).
- `moji-frame.js`: runs only inside the hidden bridge page; types the text in and reads MOJi's result.
- `background.js`: the right-click menu, requests to the local server, playback messages, re-injecting the scripts.
- `offscreen.js`: holds the current reading session and plays the audio.
- `popup.*`: reading on demand and the settings. `shared.js`: the defaults and the server address check.

## Playback and cancelling

The background service worker only passes messages and keeps no playback state in globals, because Chrome may stop it at any time. The source tab is kept in `chrome.storage.session`, and the reading session lives in the offscreen page. A pending promise makes sure the offscreen page is created only once.

The study page sends sentence-by-sentence reading together with the repeat and loop settings, and the background forwards `previous`, `next` and `practice`. The player keeps the sentence list, the index and the paused state. Switching sentences cancels any old generation, playback or pause. The first pass may start from the clicked word; repeats read the whole sentence. Repeat and loop changes take effect at once.

The state has a `phase` that tells generation, playback and the shadowing pause apart. The progress time belongs to the current sentence only, so switching while paused leaves no old time behind, and seeking is not possible during generation or the pause. Leaving the study page stops its reading and clears the highlight.

## The hidden MOJi bridge

The study page does not call MOJi's login-protected APIs. It lets a hidden `/ana` or `/trans` MOJi page send its own request, and the bridge reads the result. MOJi shows translations character by character, so the bridge watches the request result to get the whole text at once.

`open()` only shows the study page and restores the saved content; it must not create the bridge. `ask()` creates the needed iframe the first time that kind of result is wanted and reuses it afterwards. Text sent before the bridge is ready waits for its ready message. Choosing Bing or Google never creates the MOJi translation page.

Creating both bridge pages on every open used to keep Chrome's loading spinner turning after the content was already shown; see the 2026-09-30 entry in [devlog.md](devlog.md). Do not add `loading="lazy"` to a bridge page that sits off screen, or it may never load.

Replies are checked against the origin, the iframe source and the current text, so an old result never overwrites new input. A request shows a timeout notice after 45 seconds. Background tabs can slow the bridge, and a MOJi redesign can break it.

## Saving

- `chrome.storage.sync`: the popup settings, the repeat count, auto reading and `studyPrefs`.
- `chrome.storage.local`: the voice list and `study` (the text, words, translation, phrase breaks and sentence patterns). When old saved content has no sentence patterns, the page asks the server for them again.
- `sessionStorage`: only whether this tab is on the study page, for restoring after a refresh.
