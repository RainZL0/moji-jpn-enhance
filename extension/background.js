// Glue only: the player itself lives in offscreen.js so audio keeps playing when
// the page changes or the popup closes. This worker can be shut down by Chrome at any
// time, so it keeps no state of its own.
import { getSettings } from "./shared.js";

let creating = null;

async function hasPlayer() {
  return (await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })).length > 0;
}

async function ensurePlayer() {
  if (await hasPlayer()) return;
  creating ??= chrome.offscreen
    .createDocument({
      url: "offscreen.html",
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Keep the read-aloud audio playing after the page or popup closes",
    })
    .finally(() => (creating = null));
  await creating;
}

async function read(text, tabId, startAt = 0, practice) {
  text = String(text ?? "").trim();
  if (!text) return;
  await chrome.storage.session.set({ originTab: tabId ?? null });
  await ensurePlayer();
  const settings = await getSettings();
  if (practice) Object.assign(settings, { split: true, repeat: practice.repeat, loop: Boolean(practice.loop) });
  chrome.runtime.sendMessage({ target: "offscreen", type: "play", text, startAt, settings });
}

async function control(action, seconds, repeat, loop) {
  if (await hasPlayer()) chrome.runtime.sendMessage({ target: "offscreen", type: action, seconds, repeat, loop });
}

async function currentState() {
  if (!(await hasPlayer())) return { state: "idle" };
  try {
    return (await chrome.runtime.sendMessage({ target: "offscreen", type: "getState" })) ?? { state: "idle" };
  } catch {
    return { state: "idle" };
  }
}

// A request to the local server for study.js: the words of a text with readings and grammar
// labels (/api/analyze), or a Google or Bing translation (/api/translate).
// Answers { result } or { error }.
async function askServer(path, body) {
  const { server } = await getSettings();
  let res;
  try {
    res = await fetch(`${server}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    return { error: "Cannot reach the read-aloud server. Please run start.ps1 first" };
  }
  if (res.status === 404 || res.status === 405) return { error: "The read-aloud server is an old version. Please run start.ps1 again" };
  // The server explains its own errors (such as a failed translation) in "detail".
  const detail = res.ok ? null : await res.json().then((d) => d?.detail).catch(() => null);
  if (!res.ok) return { error: typeof detail === "string" ? detail : `The read-aloud server returned an error (${res.status}). You may need to run start.ps1 again` };
  return { result: await res.json() };
}

async function toOrigin(msg) {
  const { originTab } = await chrome.storage.session.get("originTab");
  if (originTab != null) chrome.tabs.sendMessage(originTab, msg).catch(() => {});
}

async function onState(state) {
  const badge = { loading: "…", playing: "♪", waiting: "♪", paused: "||" }[state.state] ?? "";
  chrome.action.setBadgeText({ text: badge });
  chrome.action.setBadgeBackgroundColor({ color: "#ff5a5f" });
  toOrigin({ type: "state", state });
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.target !== "background") return;
  switch (msg.type) {
    case "state":
      onState(msg.state);
      break;
    case "progress":
      toOrigin({ type: "progress", now: msg.now });
      break;
    case "time":
      toOrigin({ type: "time", current: msg.current, duration: msg.duration });
      break;
    case "read":
      read(msg.text, sender.tab?.id ?? msg.tabId, msg.startAt, msg.practice);
      break;
    case "control":
      control(msg.action, msg.seconds, msg.repeat, msg.loop);
      break;
    case "getState":
      currentState().then(reply);
      return true; // answer asynchronously
    case "analyze":
      askServer("/api/analyze", { text: msg.text }).then(reply);
      return true;
    case "translate":
      askServer("/api/translate", { lines: msg.lines, service: msg.service }).then(reply);
      return true;
    case "grammar":
      askServer("/api/grammar", { text: msg.text, lang: "en" }).then(reply);
      return true;
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.create({ id: "read", title: "Read the selected text aloud", contexts: ["selection"] });
  // MOJi pages that were open before an update still hold the old page script, which can no
  // longer talk to the extension. Give them the new one, so they work without a refresh.
  for (const tab of await chrome.tabs.query({ url: "https://www.mojidict.com/*" })) {
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js", "grammar.js", "study-text.js", "study-grammar.js", "study-card.js", "study.js"] }).catch(() => {});
  }
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "read") read(info.selectionText, tab?.id);
});
