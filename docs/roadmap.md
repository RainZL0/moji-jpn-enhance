# Roadmap

Unfinished work, most important first. Delete an item when it is done and add a line to [reference/devlog.md](reference/devlog.md).

## Choose one copy of the tool

A second copy of the tool sits next to this repository in `../moji-study-standalone-copy` (local only, not on GitHub, left untouched for now). Its teaching data is newer: rewritten explanations for every pattern, comparisons of easily confused patterns, detection hints, and a fix that tells the two kinds of `そうだ` apart. This repository still has the older data, while the extension code of the two copies was last synced on 2026-09-30. Decide which copy goes on, bring the other one's changes over, check them with `./test.ps1`, and retire the other copy.

## First public release

1. Add a license and the notices of third-party packages.
2. Review the teaching data: a native speaker or teacher review of each pattern, an independent check of the difficulty tags, and the sources of the early entries (see [grammar-patterns.md](reference/grammar-patterns.md#where-the-entries-came-from)). If outside teaching material is added, record its author, date and permission.
3. Make install easy: release a zip with the extension and the server, a start script that also works outside Windows, and a short install guide with screenshots. A later step can pack the server into one program (for example with PyInstaller) so no uv is needed.
4. Add CI that runs `./test.ps1`, then publish a GitHub Release.

The Chrome Web Store is a later step. As it is, the extension needs the local server and drives MOJi's pages, which store review is likely to reject. It would need speech in the browser (`speechSynthesis`), word splitting in JavaScript, the pattern data shipped inside the extension, and either a name without "MOJi" or MOJi's permission.

## Later

- Firefox support.
- Split the study page further, and add tests for it, when those parts are changed anyway.
