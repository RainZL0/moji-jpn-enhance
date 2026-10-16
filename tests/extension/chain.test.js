// grammar.js chain() on example sentences: what is attached to a word, piece by piece.
// The words come from the local server, so these are skipped when it is not running.
//   node --test "tests/extension/*.test.js"                         (server at http://localhost:8000)
//   $env:TTS_SERVER = "http://127.0.0.1:8001"; node --test "tests/extension/*.test.js"
const test = require("node:test");
const assert = require("node:assert/strict");
const { chain } = require("../../extension/grammar.js");

const server = process.env.TTS_SERVER ?? "http://localhost:8000";

// Each case: a sentence, the word to point at, and the pieces expected ("" for no chain).
const cases = [
  ["酒は米から作られています。", "作ら", "作ら | れ:passive / respect | て:joins | い:is doing... / state goes on | ます:polite"],
  ["酒は米から作られています。", "ます", "作ら | れ:passive / respect | て:joins | い:is doing... / state goes on | ます:polite"],
  ["子供に野菜を食べさせられた。", "食べ", "食べ | させ:causative (make, let) | られ:passive / can / respect | た:past or done"],
  ["行きたくなかった。", "行き", "行き | たく:want to | なかっ:not | た:past or done"],
  ["全部読んでしまおう。", "読ん", "読ん | で:joins | しまおう:...all done / regret, let's..."],
  ["見ないでください。", "見", "見 | ない:not | で:joins | ください:please do... (honorific)"],
  ["雨が降りそうだ。", "降り", "降り | そう:looks like... | だ:is (plain)"],
  ["あれは本だそうです。", "本", "本 | だ:is (plain) | そう:I hear | です:is (polite)"],
  ["静かな町。", "静か", "静か | な:before a noun"],
  ["寒くないでしょう。", "寒く", "寒く | ない:not | でしょう:probably (guess)"],
  ["休みましょう。", "休み", "休み | ましょう:polite, let's..."],
  ["雨が降ったら行かない。", "降っ", "降っ | たら:if... / after..."],
  ["毎日勉強しなさい。", "勉強", "勉強 | し:do | なさい:command (do...)"],
  ["飲んでみる。", "飲ん", "飲ん | で:joins | みる:try doing..."],
  ["書けば分かる。", "書け", "書け | ば:if"],
  ["窓が開けてある。", "開け", "開け | て:joins | ある:is left... (state)"],
  ["本を読まれる。", "読ま", "読ま | れる:passive / respect"],
  ["行ったり来たりする。", "行っ", "行っ | たり:doing things like..."],
  ["行こうと思う。", "行こう", ""],
  ["彼はコーヒーを飲む。", "飲む", ""],
];

async function words(text) {
  const res = await fetch(server + "/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return res.json();
}

test("chain", async (t) => {
  try {
    await words("");
  } catch {
    t.skip(`local server not reachable at ${server}`);
    return;
  }
  for (const [text, word, want] of cases) {
    await t.test(`${text} (${word})`, async () => {
      const tokens = await words(text);
      const i = tokens.findIndex((w) => w.surface === word);
      assert.ok(i >= 0, `no word ${word}`);
      const c = chain(tokens, i);
      const got = c ? c.map((p) => (p.meaning ? `${p.surface}:${p.meaning}` : p.surface)).join(" | ") : "";
      assert.equal(got, want);
    });
  }
});
