# Conventions

## Code and commits

- Everything is in English (docs, code comments, UI text, tests, commit messages), except the Japanese being studied.
- Run `./test.ps1` before committing, and commit only if it passes. Single commands are in [reference/testing.md](reference/testing.md).
- End commit messages with the co-author line of the model that wrote them.
- Git follows GitHub flow: `master` is always working and protected. Make a branch from `master`, push it, open a pull request, and merge it with squash merge (the only method `master` allows). Merges between other branches can use any method.
- Files that must never go into git (personal notes, backups) go in `private/`, which is ignored.
- Never use MOJi translation in tests (it costs the user's AI points). Never print, store or send the MOJi `_SessionToken` or any other token.
- Never run Prettier on the extension files.
- Python: run it with `uv run` inside `server/`, or `uv run --no-project python <file>`. Line length 120; `uvx ruff check` and `uvx ruff format` must pass.
- Shell on Windows: use PowerShell here-strings for multi-line text.

## Docs

- Docs live in `docs/`. Outside it there are only the front page `README.md` and this repository's `CLAUDE.md`, which only points here.
- One fact in one place. Link to it instead of repeating it. Each doc says in its first lines what it covers.
- Keep docs true to the current code. When you change behavior, change the doc that describes it in the same commit, and delete what is no longer true. Do not write numbers that go stale by themselves (test counts, line counts); the code or a command can tell them.
- Indexes have levels: `docs/README.md` lists the docs in `docs/`, and each subfolder has its own `README.md` index. When an index passes about eight entries, move the less-read docs into a subfolder.
- The more often a doc is read, the shorter it is. `CLAUDE.md` is the shortest, then the indexes and this page, then the top-level docs. Long detail goes into `reference/`.
- Unfinished work goes in [roadmap.md](roadmap.md) and is deleted when done. What was done and why goes in [reference/devlog.md](reference/devlog.md): newest first, one short entry per change, the conclusion and the reason only.
- Plain everyday language. If a technical term cannot be avoided, explain it in one sentence where it first appears.
- Links are checked with [lychee](https://lychee.cli.rs/) (settings in `lychee.toml`). `./test.ps1` checks the local links and anchors offline; run `lychee .` now and then to check the web links too.
