// study-text.js: the study page's work on the text that needs no page.
//   node --test "tests/extension/*.test.js"
const test = require("node:test");
const assert = require("node:assert/strict");
const s = require("../../extension/study-text.js");

const tok = (start, surface, pos, extra = {}) => ({ start, end: start + surface.length, surface, pos, kana: "", ruby: [], ...extra });

test("sameText ignores spaces and line breaks", () => {
  assert.ok(s.sameText("今日は\n いい天気", "今日はいい天気"));
  assert.ok(!s.sameText("今日は", "明日は"));
});

test("roughTokens cuts words and skips spaces", () => {
  const t = s.roughTokens("猫が 好き。");
  assert.ok(t.every((w) => w.surface.trim()));
  assert.equal(t.map((w) => w.surface).join(""), "猫が好き。");
  assert.deepEqual(t.at(-1).pos, ["補助記号"]);
});

test("splitRuby puts kana over the kanji only", () => {
  assert.deepEqual(s.splitRuby("食べる", "たべる", 0), [[0, 1, "た"]]);
  assert.deepEqual(s.splitRuby("お茶", "おちゃ", 5), [[6, 7, "ちゃ"]]);
  assert.deepEqual(s.splitRuby("日本語", "にほんご", 0), [[0, 3, "にほんご"]]);
  // Kana that does not fit goes over the whole word.
  assert.deepEqual(s.splitRuby("食べる", "くう", 0), [[0, 3, "くう"]]);
});

test("useMojiReadings takes MOJi's reading for kanji words only", () => {
  const text = "米を買う";
  const tokens = [tok(0, "米", ["名詞"], { kana: "べい" }), tok(1, "を", ["助詞"]), tok(2, "買う", ["動詞"], { kana: "かう" })];
  const phrases = [[[{ childNodes: [{ surface_form: "米", reading: "コメ" }, { surface_form: "を", reading: "ヲ" }] }, { childNodes: [{ surface_form: "買う", reading: "カウ" }] }]]];
  assert.deepEqual(s.useMojiReadings(tokens, text, phrases), [0]);
  assert.equal(tokens[0].kana, "こめ");
  assert.deepEqual(tokens[0].ruby, [[0, 1, "こめ"]]);
});

test("phraseStarts by the word rule, before MOJi's analysis", () => {
  const tokens = [tok(0, "日本", ["名詞"]), tok(2, "語", ["名詞"]), tok(3, "を", ["助詞"]), tok(4, "読ん", ["動詞"]), tok(6, "で", ["助詞", "接続助詞"]), tok(7, "いる", ["動詞", "非自立可能"])];
  const { starts, core } = s.phraseStarts(tokens, "日本語を読んでいる", null);
  assert.deepEqual([...starts.keys()], [0, 4]);
  assert.equal(core.size, 0);
});

test("phraseStarts from MOJi's phrases, with links and the core", () => {
  const chunk = (surface, id, link) => ({ childNodes: [{ surface_form: surface }], attributes: { id, link } });
  const phrases = [[[chunk("猫が", 0, 2), chunk("とても", 1, 2), chunk("好き。", 2, -1)]]];
  const { starts, core } = s.phraseStarts([], "猫がとても好き。", phrases);
  assert.deepEqual([...starts], [[0, 5], [2, 5], [5, -1]]);
  assert.deepEqual([...core].sort(), [0, 2, 5]);
});

test("translationLines puts each sentence under its row", () => {
  const text = "こんにちは。元気ですか。";
  const rows = [{ start: 0, end: 6 }, { start: 6, end: 12 }];
  const lines = s.translationLines([{ src: "元気ですか。", dst: "How are you?" }, { src: "こんにちは。", dst: "Hello." }], text, rows);
  // Matched in order: once 元気ですか。 is found, こんにちは。 is not looked for before it,
  // so it goes after the last row used.
  assert.deepEqual(lines, ["", "How are you? Hello."]);
  assert.deepEqual(s.translationLines([{ src: "こんにちは。", dst: "Hello." }, { src: "元気ですか。", dst: "How are you?" }], text, rows), ["Hello.", "How are you?"]);
});

test("wordFor and levelOf", () => {
  const words = [{ spell: "食べる", pron: "たべる", level: ["N5", "N4"] }];
  assert.equal(s.wordFor(words, tok(0, "食べ", ["動詞"], { base: "食べる" })), words[0]);
  assert.equal(s.wordFor(words, tok(0, "飲む", ["動詞"], { base: "飲む" })), undefined);
  assert.equal(s.levelOf(words[0]), 5);
  assert.equal(s.levelOf(undefined), 0);
});
