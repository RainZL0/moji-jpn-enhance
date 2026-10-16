const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { roughTokens } = require("../../extension/study-text.js");
const dom = import("happy-dom");
const scripts = ["content", "grammar", "study-text", "study-grammar", "study-card", "study"]
  .map((name) => fs.readFileSync(path.join(__dirname, `../../extension/${name}.js`), "utf8"));
const text = "窓を開ける。風が入る。";

async function fixture({ hash = "#tts-study", translate = "bing", reload = false } = {}) {
  const { Window } = await dom;
  // No remote frames, scripts or styles are fetched; no MOJi buttons are executed.
  const window = new Window({ url: `https://www.mojidict.com/search${hash}`, settings: {
    enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true, disableIframePageLoading: true,
    disableJavaScriptFileLoading: true, disableCSSFileLoading: true,
  } });
  const sent = [];
  let animationFrames = 0;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => raf((time) => { animationFrames++; callback(time); });
  // The sidebar labels below copy MOJi's own Chinese menu text (search, translate).
  window.document.body.innerHTML = '<div class="sidebar-menu"><div class="menu-item active"><a href="/search"><span class="menu-item-title">搜索</span></a></div><div class="menu-item"><a href="/trans"><span class="menu-item-title">翻译</span></a></div></div>';
  const saved = { text, tokens: roughTokens(text), sentences: [{ src: text, dst: "Open the window and the wind blows in." }], transDone: true, transBy: translate, words: [], phrases: null, grammar: { found: [], patterns: {} } };
  window.chrome = {
    runtime: {
      getURL: (name) => `https://extension.invalid/${name}`,
      onMessage: { addListener() {} },
      sendMessage: async (message) => {
        sent.push(message);
        if (message.type === "analyze") return { result: roughTokens(message.text) };
        if (message.type === "grammar") return { result: { found: [], patterns: {} } };
        if (message.type === "translate") return { result: { lines: message.lines.map(() => "Translation") } };
      },
    },
    storage: {
      sync: { get: async (defaults) => ({ ...defaults, studyPrefs: { ...defaults.studyPrefs, translate } }), set: async () => {} },
      local: { get: async () => ({ study: saved }), set: async () => {} },
      onChanged: { addListener() {} },
    },
  };
  if (reload) {
    window.sessionStorage.setItem("mojiTtsStudyOpen", "1");
    window.performance.getEntriesByType = () => [{ type: "reload", name: "https://www.mojidict.com/search" }];
  }
  for (const script of scripts) window.eval(script);
  await Promise.resolve();
  await Promise.resolve();
  return { window, sent, animationFrames: () => animationFrames };
}

test("refresh restores saved study content without loading hidden MOJi pages", async () => {
  const { window, sent } = await fixture();
  try {
    assert.equal(window.mojiTts.study.isOpen(), true);
    assert.equal(window.document.querySelector("textarea").value, text);
    assert.match(window.document.querySelector(".st-result").textContent, /窓/);
    assert.equal(window.document.querySelectorAll("iframe").length, 0);
    assert.equal(sent.length, 0);
  } finally { await window.happyDOM.close(); }
});

test("reload recovery after MOJi removes the hash also needs no frames", async () => {
  const { window } = await fixture({ hash: "", reload: true });
  try {
    assert.equal(window.mojiTts.study.isOpen(), true);
    assert.equal(window.location.hash, "#tts-study");
    assert.equal(window.document.querySelectorAll("iframe").length, 0);
  } finally { await window.happyDOM.close(); }
});

test("opening study from another page and repeated DOM changes settle without frames", async () => {
  const { window, animationFrames } = await fixture({ hash: "" });
  try {
    assert.equal(window.mojiTts.study.isOpen(), false);
    window.document.querySelector(".moji-tts-menu").click();
    window.document.body.append(window.document.createElement("p"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const before = animationFrames();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(animationFrames(), before, "DOM observers must become idle");
    assert.equal(window.document.querySelectorAll(".moji-tts-menu").length, 1);
    assert.equal(window.document.querySelectorAll("iframe").length, 0);
  } finally { await window.happyDOM.close(); }
});

test("explicit analysis with Bing creates only one reusable analysis frame", async () => {
  const { window } = await fixture();
  try {
    const button = [...window.document.querySelectorAll("button")].find((b) => b.textContent === "Translate and analyze");
    button.click();
    await Promise.resolve();
    const frame = window.document.querySelector("iframe");
    assert.equal(frame?.getAttribute("src"), "/ana");
    assert.equal(window.document.querySelectorAll("iframe").length, 1);
    window.document.querySelector("textarea").value = "風が止む。";
    button.click();
    await Promise.resolve();
    assert.equal(window.document.querySelector("iframe"), frame);
    assert.equal(window.document.querySelectorAll("iframe").length, 1);
  } finally { await window.happyDOM.close(); }
});

test("a saved MOJi preference does not load translation until explicitly requested", async () => {
  const { window } = await fixture({ translate: "moji" });
  try {
    assert.equal(window.document.querySelectorAll("iframe").length, 0);
    window.document.querySelector("textarea").value = "風が止む。";
    [...window.document.querySelectorAll("button")].find((b) => b.textContent === "Translate and analyze").click();
    assert.deepEqual([...window.document.querySelectorAll("iframe")].map((f) => f.getAttribute("src")).sort(), ["/ana", "/trans"]);
  } finally { await window.happyDOM.close(); }
});
