# Installing and Using the Extension

How to install the extension and its server, and what the study page, the player and the popup do. How it works inside is in [reference/extension-internals.md](reference/extension-internals.md).

## Install

You need Windows, [uv](https://docs.astral.sh/uv/) and Chrome 116 or newer. Firefox is not supported yet.

1. In the repository folder run `./start.ps1`. It starts the local server on `http://localhost:8000`; the first run installs the Python packages. Keep it running while you use the extension.
2. Open `chrome://extensions`, turn on developer mode, choose "Load unpacked" and select the `extension/` folder.

The server address can be changed in the extension popup (start the server with `./start.ps1 -Port <port>`). Only an HTTP address on `localhost` or `127.0.0.1` is accepted. After changing the extension code, reload it on the extensions page, and refresh open MOJi pages if needed.

## Study page

Open MOJi and choose "Read-Aloud Study" under "Translate" in the left menu, or open a MOJi address ending in `#tts-study`. Type Japanese and click "Translate & Analyze" or press Ctrl+Enter. Input is limited to 2000 characters, and MOJi's phrase analysis to 1000; beyond that you still get the local word splitting.

The text is shown one sentence per line, with the reading, the translation and the sentence patterns. Click a word to read from that word. Hover over a word to see its reading, base form, part of speech, conjugation, pitch accent, the MOJi meaning if there is one, and the parts attached after it. Once MOJi's phrase result comes back you also see which words modify which, and the core of the sentence.

Open a sentence pattern on the right to see its meaning, connection, explanation, examples and translation; the example button reads only the Japanese. The difficulty tag is for reference only.

"Kana" can be always shown, shown on hover, or off; "Translation" can be always shown or shown on hover. "Display settings" turns on the sentence core, part-of-speech text or underlines, verb groups, dictionary entries and the sentence-pattern list. Only the sentence patterns are on by default.

The content and results are saved on this machine and come back on refresh or the next visit.

## Player

The buttons are in the top row of the bottom bar, and the current sentence's progress bar and time are below them.

- "Read all" plays the text sentence by sentence. It turns into "Pause", then "Resume".
- "Previous" and "Next" switch sentences. Switching while paused stays paused.
- "Per sentence" repeats each sentence 1, 2, 3 or 5 times. "Loop sentence" repeats the current one until you turn it off. Both take effect at once.
- When you start by clicking a word, the first pass starts from that word and repeats start from the beginning of the sentence.
- The progress bar can be dragged or moved with the keyboard, except while speech is being made or during the shadowing pause.
- Leaving the study page stops its reading.

The toolbar popup sets the voice, speech rate, pitch, volume, the shadowing pause (silence after each sentence for speaking along) and auto reading after analysis. Switching tabs or closing the popup does not stop the sound.

## Translation

Google and Bing go through the local server and cost nothing. MOJi translation uses your MOJi account's AI points. "No translation" only analyzes. Switching to Google or Bing re-translates the text already shown; after switching to MOJi you have to click the analyze button again.

Local word splitting and sentence patterns work offline. MOJi's phrase breaks, meanings and readings need the MOJi site and your login. If one part fails, its status is shown under the input box and the other results are still shown.

## Other MOJi pages

Other MOJi pages are left as they are, apart from the "Read-Aloud Study" entry in the sidebar. To have any text read there, use the extension popup, or select text and choose "Read selected text" from the right-click menu.
