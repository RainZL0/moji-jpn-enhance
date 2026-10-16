const test = require("node:test");
const assert = require("node:assert/strict");
const { details } = require("../../extension/study-grammar.js");
const dom = import("happy-dom");

async function fixture() {
  const { Window } = await dom;
  const window = new Window();
  const h = (tag, props = {}, ...children) => {
    const el = window.document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === "class") el.className = value;
      else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
      else el.setAttribute(key, value);
    }
    el.append(...children.flat().filter((c) => c != null));
    return el;
  };
  return { window, h, root: h("div") };
}

test("shows connection, contrast, recognition limits and a Japanese example as separate text", async () => {
  const { window, h, root } = await fixture();
  try {
    root.append(...details({ connection: "verb て-form + ある", note: "Focuses on the result that is left in place.", contrast: "Different from ている, which is an action in progress.", recognitionNote: "Some variants may be missed.", example: "入口に地図が置いてある。", translation: "A map is placed at the entrance." }, h, () => {}));
    assert.equal(root.querySelectorAll(".st-gnote").length, 4);
    assert.match(root.textContent, /Connection: verb て-form \+ ある/);
    assert.match(root.textContent, /Contrast: Different from ている/);
    assert.match(root.querySelector(".st-glimit").textContent, /Recognition hint/);
    assert.equal(root.querySelector('[lang="ja"]').textContent, "入口に地図が置いてある。");
    assert.equal(root.querySelector(".st-gtrans").textContent, "A map is placed at the entrance.");
  } finally { await window.happyDOM.close(); }
});

test("reading an example passes only its Japanese text and does not toggle its parent", async () => {
  const { window, h, root } = await fixture();
  try {
    let parentClicks = 0;
    const spoken = [];
    root.addEventListener("click", () => parentClicks++);
    root.append(...details({ example: "窓を開けてください。", translation: "Please open the window." }, h, (text) => spoken.push(text)));
    root.querySelector("button").click();
    assert.deepEqual(spoken, ["窓を開けてください。"]);
    assert.equal(parentClicks, 0);
  } finally { await window.happyDOM.close(); }
});

test("old or incomplete records omit missing fields without showing null", async () => {
  const { window, h, root } = await fixture();
  try {
    root.append(...details({ note: "Old format note." }, h, () => {}));
    assert.equal(root.textContent, "Old format note.");
    assert.equal(root.querySelector("button"), null);
    assert.deepEqual(details({}, h, () => {}), []);
  } finally { await window.happyDOM.close(); }
});

test("teaching fields remain text instead of being interpreted as HTML", async () => {
  const { window, h, root } = await fixture();
  try {
    const text = '<img src="invalid" onerror="alert(1)">';
    root.append(...details({ connection: text, contrast: text, example: text }, h, () => {}));
    assert.equal(root.querySelector("img"), null);
    assert.match(root.textContent, /<img/);
  } finally { await window.happyDOM.close(); }
});
