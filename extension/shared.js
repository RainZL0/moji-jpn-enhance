// Settings and helpers shared by the background worker, the player page and the popup.

export const DEFAULTS = {
  server: "http://localhost:8000",
  voice: "ja-JP-NanamiNeural",
  rate: 0, // percent, sent to the server
  pitch: 0, // Hz
  volume: 0, // percent
  repeat: 1, // times each piece is played
  gap: 0, // silent pause after each play, in multiples of the clip length (for speaking along)
  split: false, // true: one sentence at a time
  readToEnd: true, // click-to-read goes on to the end of the whole text, not just the paragraph
  autoRead: false, // read the whole text aloud after "Translate and analyze" on the study page
};

export async function getSettings() {
  const s = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
  s.server = normalizeServer(s.server) || DEFAULTS.server;
  return s;
}

// Only localhost is allowed, because that is all the manifest has permission for.
export function normalizeServer(value) {
  try {
    const url = new URL(String(value).trim());
    if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname)) return "";
    return url.origin;
  } catch {
    return "";
  }
}

// Runs inside the page (via chrome.scripting), so it must not use anything from outside.
// Returns the selected text without furigana (the small kana written above kanji).
export function pageSelection() {
  const el = document.activeElement;
  if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT") && el.selectionStart !== el.selectionEnd) {
    return el.value.slice(el.selectionStart, el.selectionEnd).trim();
  }
  const sel = getSelection();
  if (!sel || sel.isCollapsed) return "";
  const box = document.createElement("div");
  for (let i = 0; i < sel.rangeCount; i++) box.append(sel.getRangeAt(i).cloneContents());
  box.querySelectorAll("rt, rp").forEach((n) => n.remove());
  return box.textContent.trim();
}
