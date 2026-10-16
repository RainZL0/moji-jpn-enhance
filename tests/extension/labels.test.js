// grammar.js: the English names for UniDic's word labels. Needs nothing else.
//   node --test "tests/extension/*.test.js"
const test = require("node:test");
const assert = require("node:assert/strict");
const g = require("../../extension/grammar.js");

const word = (pos, cType = "") => ({ pos, cType });

test("wordClass gives the colour group", () => {
  assert.equal(g.wordClass(word(["代名詞"])), "noun");
  assert.equal(g.wordClass(word(["形状詞", "一般"])), "adj");
  assert.equal(g.wordClass(word(["接続詞"])), "");
});

test("verbGroup in both namings", () => {
  const cases = [
    ["五段-カ行", "Godan", "Group 1"],
    ["下一段-バ行", "Ichidan", "Group 2"],
    ["サ行変格", "Suru", "Group 3"],
    ["カ行変格", "Kuru", "Group 3"],
  ];
  for (const [cType, plain, cls] of cases) {
    assert.equal(g.verbGroup(word(["動詞"], cType)), plain);
    assert.equal(g.verbGroup(word(["動詞"], cType), "class"), cls);
  }
  assert.equal(g.verbGroup(word(["形容詞"], "形容詞")), "");
  assert.equal(g.verbGroup(word(["動詞"], "文語四段-ハ行")), "");
});

test("verbType for the word card", () => {
  assert.equal(g.verbType("五段-ラ行"), "Godan verb (ラ行)");
  assert.equal(g.verbType("上一段-マ行"), "Ichidan verb");
  assert.equal(g.verbType(""), "");
});

test("every short word class has a full name", () => {
  for (const k of Object.keys(g.POS_SHORT)) assert.ok(g.POS[k], k);
});
