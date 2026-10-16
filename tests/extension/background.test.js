// background.js asks the local server for words, translations and grammar (askServer).
// These check what it answers when the server is missing, old, or reports an error,
// with pretend `chrome` and `fetch` (no browser, no server).
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

let onMessage;
const forwarded = [];
const on = { addListener() {} };
globalThis.chrome = {
  runtime: { onMessage: { addListener: (f) => (onMessage = f) }, onInstalled: on, getContexts: async () => [{}], sendMessage: async msg => forwarded.push(msg) },
  contextMenus: { onClicked: on },
  storage: { sync: { get: async () => ({}) }, session: { set: async () => {} } },
};

const loaded = import(pathToFileURL(path.join(__dirname, "../../extension/background.js")).href);

// Sends `msg` to background.js with the server answering `answer` (a Response, or an error to throw).
async function ask(msg, answer) {
  await loaded;
  globalThis.fetch = async () => {
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return new Promise((reply) => assert.strictEqual(onMessage({ target: "background", ...msg }, {}, reply), true));
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("gives the server's answer", async () => {
  assert.deepStrictEqual(await ask({ type: "grammar", text: "x" }, json({ found: [] })), { result: { found: [] } });
});

test("an old server without /api/grammar: asks to start the new one", async () => {
  assert.deepStrictEqual(await ask({ type: "grammar", text: "x" }, json({ detail: "Not Found" }, 404)), { error: "The read-aloud server is an old version. Please run start.ps1 again" });
});

test("no server: asks to start it", async () => {
  assert.deepStrictEqual(await ask({ type: "analyze", text: "x" }, new TypeError("fetch failed")), { error: "Cannot reach the read-aloud server. Please run start.ps1 first" });
});

test("the server's own explanation of an error is passed on", async () => {
  assert.deepStrictEqual(await ask({ type: "translate", lines: ["x"], service: "google" }, json({ detail: "Translation failed" }, 502)), { error: "Translation failed" });
});

test("study reading requests sentence splitting and its current repeat settings", async () => {
  await loaded;
  onMessage({ target: "background", type: "read", text: "一つ。二つ。", practice: { repeat: 3, loop: true } }, { tab: { id: 2 } }, () => {});
  await new Promise(setImmediate);
  const msg = forwarded.at(-1);
  assert.strictEqual(msg.target, "offscreen");
  assert.strictEqual(msg.settings.split, true);
  assert.strictEqual(msg.settings.repeat, 3);
  assert.strictEqual(msg.settings.loop, true);
  assert.strictEqual(msg.settings.server, "http://localhost:8000");
});

test("navigation and live practice changes reach the player", async () => {
  await loaded;
  onMessage({ target: "background", type: "control", action: "next" }, {}, () => {});
  await new Promise(setImmediate);
  assert.strictEqual(forwarded.at(-1).type, "next");
  onMessage({ target: "background", type: "control", action: "practice", repeat: 2, loop: false }, {}, () => {});
  await new Promise(setImmediate);
  assert.strictEqual(forwarded.at(-1).repeat, 2);
  assert.strictEqual(forwarded.at(-1).loop, false);
});

