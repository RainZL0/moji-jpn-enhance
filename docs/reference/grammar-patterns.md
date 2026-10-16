# Sentence-Pattern Detection

How the study page finds sentence patterns (〜ている, 〜なければならない, ...), how a pattern is written, where the entries came from, and how to add one. Detection runs on the server (`POST /api/grammar`); the code is in `server/jpstudy/grammar/`.

## Files

- `__init__.py`: the detector. The comment at the top of the file is the full definition of the format.
- `patterns.json`: the patterns. Each has an id, a name, a level (N5 to N1, or "colloquial" for everyday spoken forms that the textbook tables lack), how to recognize it (`match`) and example sentences.
- `en.json`: the English explanations (meaning, note and translation) by pattern id.

## The format in short

A pattern is a row of words separated by spaces. A word is a set of conditions joined by `&`:

- `s=` the written form in the text.
- `l=` the UniDic base form; for example 「いる」 is `居る`.
- `b=` the base form as written, for example `いる`.
- `p=` the start of the part of speech, for example `助詞,接続助詞`.
- `f=` the start of the conjugation form, for example `仮定形`.
- `t=` the start of the conjugation type, for example `五段`.
- `|` a choice, for example `l=良い|宜しい`.
- `!` not the condition after it, for example `!s=に`.
- `?` the word is optional.
- `~` checks the word without counting it in the pattern; `~!` requires that the next word does not match or does not exist.
- `…` allows up to 10 other words in between.
- `*` exactly one word.

Example: `l=て&p=助詞 l=居る` finds 「て」 followed by 「いる」. `match` can have several rows for several ways of writing the same pattern.

Two things to watch:

- `&` ties all conditions of one word together: `~p=A|B&s=に` means "(A or B) and it is に". For other combinations, write several rows.
- When all the words of a pattern fall inside a longer pattern that was found, only the longer one is shown. So a short pattern's example must not also contain a longer pattern.

## Where the entries came from

The early range and level tags were compared against three sources. The tags have not been re-rated independently and are not an official list.

1. The 「機能語」 (function words) tables the Japan Foundation published before 2009: 99 entries for old level 1 (about N1) and 170 for old level 2 (about N2 and part of N3). Copies online: [level 1](http://www7a.biglobe.ne.jp/nifongo/data/l1_kino.html), [level 2](http://www7a.biglobe.ne.jp/nifongo/data/l2_kino.html).
2. The N5 to N3 lists of JLPT Sensei: [N5](https://jlptsensei.com/jlpt-n5-grammar-list/), [N4](https://jlptsensei.com/jlpt-n4-grammar-list/), [N3](https://jlptsensei.com/jlpt-n3-grammar-list/). Entries only in the old level 2 table and not in this N3 list were put into N2. No permission to redistribute data taken from this site was found, so none of its text is shipped.
3. The subtitles of one live stream, used to find spoken forms and to catch wrong detections. They were removed from the repository on 2026-10-17 (see [devlog.md](devlog.md)).

### Not counted as sentence patterns

What the word card or the conjugation notes already explain is not repeated:

- Single particles and sentence-final particles (は, が, を, ね, よ ...).
- The conjugation forms themselves (ます form, て form, passive ...): the word card and the chain after the word (作ら → れ → て) cover them.
- Single adverbs, connectives and honorific verbs (きっと, つまり, いらっしゃる ...): a dictionary is enough. But an adverb that changes meaning together with a later negative counts (なかなか〜ない, めったに〜ない, どんなに〜ても).

### Limits of the dictionary

Some expressions are one word in the dictionary, so their parts cannot be found: 〜まみれ (泥まみれ), 〜かける (言いかける), 〜直す (書き直す), 〜込む (飛び込む), 〜たて (焼きたて). 〜でなくてなんだろう after 「愛で」 is read as the verb 「愛でる」, but works after other nouns.

Some table entries are found through existing patterns instead of their own: 〜出す under 〜始める, 〜づらい under 〜やすい・〜にくい, 〜ているところ under 〜ところだ.

## Adding a pattern

1. See how the example sentence is split by the local dictionary (`jpstudy.words.words_of`), then write `match`.
2. Add the id, name, level, `match` and examples to `patterns.json`, and the explanation to `en.json`.
3. Run `uv run pytest -q` in `server/`. The tests require that every pattern is found in its own examples and has an explanation.
4. Check for wrong detections. Put easily confused sentences into the comparison table in `server/tests/test_grammar.py` (what must be found and what must not). Write the test sentences yourself.

## Adding a language

Write an explanation file like `en.json` (for example `ja.json`) with the same pattern ids, pass `lang` to `/api/grammar`, and add tests for it.
