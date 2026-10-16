import { DEFAULTS, getSettings, normalizeServer, pageSelection } from "./shared.js";

const $ = (id) => document.getElementById(id);
let settings = { ...DEFAULTS };
const fmt = (n, unit) => `${n > 0 ? "+" : ""}${n}${unit}`;

// ------------------------------------------------------------ settings

function fill() {
  $("rate").value = settings.rate;
  $("pitch").value = settings.pitch;
  $("volume").value = settings.volume;
  $("repeat").value = String(settings.repeat);
  $("gap").value = String(settings.gap);
  $("split").checked = settings.split;
  $("readToEnd").checked = settings.readToEnd;
  $("autoRead").checked = settings.autoRead;
  $("server").value = settings.server;
  $("rateOut").textContent = fmt(settings.rate, "%");
  $("pitchOut").textContent = fmt(settings.pitch, " Hz");
  $("volumeOut").textContent = fmt(settings.volume, "%");
}

function save(patch) {
  Object.assign(settings, patch);
  chrome.storage.sync.set(patch);
  fill();
}

for (const id of ["rate", "pitch", "volume"]) $(id).oninput = (e) => save({ [id]: +e.target.value });
for (const id of ["repeat", "gap"]) $(id).onchange = (e) => save({ [id]: +e.target.value });
for (const id of ["split", "readToEnd", "autoRead"]) $(id).onchange = (e) => save({ [id]: e.target.checked });
$("voice").onchange = (e) => save({ voice: e.target.value });
$("allVoices").onchange = () => renderVoices();
$("server").onchange = (e) => {
  const server = normalizeServer(e.target.value);
  $("serverErr").textContent = server ? "" : "Only a local address is allowed, for example http://localhost:8000";
  if (server) {
    save({ server });
    checkServer();
  }
};

// ------------------------------------------------------------ voices and server check

let voices = [];

function renderVoices() {
  const all = $("allVoices").checked;
  const list = voices.filter((v) => all || v.locale.startsWith("ja"));
  const select = $("voice");
  select.replaceChildren(
    ...list.map((v) => {
      const o = new Option(`${v.name} (${v.gender}${all ? ", " + v.localeName : ""})`, v.id);
      o.selected = v.id === settings.voice;
      return o;
    }),
  );
  if (!list.some((v) => v.id === settings.voice)) select.add(new Option(settings.voice, settings.voice, true, true));
}

async function checkServer() {
  const conn = $("conn");
  conn.className = "conn";
  conn.textContent = "Checking...";
  try {
    const res = await fetch(`${settings.server}/api/voices`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(String(res.status));
    voices = await res.json();
    chrome.storage.local.set({ voices });
    conn.className = "conn ok";
    conn.textContent = "Connected to the read-aloud server";
    renderVoices();
  } catch {
    conn.className = "conn bad";
    conn.textContent = "Cannot connect. Please run start.ps1 first";
  }
}

// ------------------------------------------------------------ playing

const label = {
  loading: "Preparing...",
  playing: "Reading",
  waiting: "Your turn to speak",
  paused: "Paused",
};

function showState(s) {
  const busy = s.state in label;
  $("toggle").disabled = $("stop").disabled = !busy;
  $("toggle").textContent = s.state === "paused" ? "Resume" : "Pause";
  const part = s.total > 1 ? `, part ${s.index + 1}/${s.total}` : "";
  const rep = s.repeats > 1 ? `, play ${s.repeat}/${s.repeats}` : "";
  $("status").textContent = busy ? label[s.state] + part + rep : s.state === "error" ? s.message : "";
}

const send = (msg) => chrome.runtime.sendMessage({ target: "background", ...msg });

$("read").onclick = async () => {
  let text = $("text").value.trim();
  if (!text) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try {
      const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pageSelection });
      text = res?.result || "";
    } catch {}
  }
  if (!text) return ($("status").textContent = "Type some text above first, or select text on a page");
  send({ type: "read", text });
};
$("toggle").onclick = () => send({ type: "control", action: "toggle" });
$("stop").onclick = () => send({ type: "control", action: "stop" });

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "state") showState(msg.state);
});

// ------------------------------------------------------------ start

settings = await getSettings();
fill();
voices = (await chrome.storage.local.get({ voices: [] })).voices;
renderVoices();
send({ type: "getState" }).then((s) => showState(s ?? { state: "idle" }));
checkServer();
