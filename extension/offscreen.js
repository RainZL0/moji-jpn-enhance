// The player. Turns text into pieces, asks the local server for each piece, and plays
// them one after another with optional repeats and silent pauses for speaking along.
const audio = new Audio();
let run = 0; // bumped on every new request or stop, so older work notices it was cancelled
let paused = false;
let abort = null;
let wake = null; // resolves the wait for the current clip to end (used to cancel it)
let status = { state: "idle" };

let doing = "idle"; // what the player is busy with, whether or not it is paused right now
let session = null; // current text and sentence index, also retained after stopping

function emit(patch) {
  status = { ...patch };
  chrome.runtime.sendMessage({ target: "background", type: "state", state: status }).catch(() => {});
}

// Reports a step of the playback; while paused it shows as paused, and resuming shows
// the step again (so a pause during the speaking gap resumes as the gap, not as playing).
function report(state, info) {
  doing = state;
  emit({ ...info, phase: state, state: paused ? "paused" : state });
}

// ------------------------------------------------------------ splitting

const MAX_PIECE = 400;
const HARD_CUT = 1500;

// Pieces of text to synthesize one by one. `segs` pairs a position in the piece with the
// position in `text` it came from, so a spoken word can be pointed out in the original.
function splitText(text, bySentence) {
  const pieces = [];
  for (const m of text.matchAll(/[^。！？!?\n]+[。！？!?]*[」』）)]*/g)) {
    const lead = m[0].length - m[0].trimStart().length;
    const sentence = m[0].trim();
    if (!/[\p{L}\p{N}]/u.test(sentence)) continue;
    for (let i = 0; i < sentence.length; i += HARD_CUT) {
      const part = sentence.slice(i, i + HARD_CUT);
      const from = m.index + lead + i;
      const last = pieces[pieces.length - 1];
      if (!bySentence && last && last.text.length + part.length <= MAX_PIECE) {
        last.segs.push([last.text.length, from]);
        last.text += part;
      } else pieces.push({ text: part, segs: [[0, from]] });
    }
  }
  return pieces;
}

function toOriginal(piece, at) {
  let seg = piece.segs[0];
  for (const s of piece.segs) if (s[0] <= at) seg = s;
  return seg[1] + at - seg[0];
}

// Where each spoken word sits in the piece: [start, end) or null. Words are matched in
// order; one the voice pronounced differently from how it is written is skipped.
function alignWords(text, words) {
  const nfkc = text.normalize("NFKC");
  const hay = nfkc.length === text.length ? nfkc : text;
  let cursor = 0;
  return words.map((w) => {
    const needle = hay === text ? w.text : w.text.normalize("NFKC");
    const at = hay.indexOf(needle, cursor);
    // A distant match is almost certainly a different occurrence.
    if (at < 0 || at - cursor > 12 + needle.length * 2) return null;
    cursor = at + needle.length;
    return [at, cursor];
  });
}

// Index of the word being spoken at `ms`, or the last one already spoken.
function activeWord(words, ms) {
  let ans = -1;
  for (let lo = 0, hi = words.length - 1; lo <= hi; ) {
    const mid = (lo + hi) >> 1;
    if (words[mid].start <= ms) (ans = mid), (lo = mid + 1);
    else hi = mid - 1;
  }
  return ans;
}

// ------------------------------------------------------------ server

async function synthesize(text, s, signal) {
  const opts = (extra) => ({ signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]), ...extra });
  const res = await fetch(
    `${s.server}/api/synthesize`,
    opts({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: s.voice, rate: s.rate, pitch: s.pitch, volume: s.volume }),
    }),
  );
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json()).detail;
    } catch {}
    throw new Error(typeof detail === "string" && detail ? detail : `Could not generate speech (${res.status})`);
  }
  const { id, duration, words } = await res.json();
  return { url: `${s.server}/api/audio/${id}.mp3`, duration, words };
}

function friendly(err) {
  if (err?.name === "TimeoutError") return "The read-aloud server is too slow to answer. Please try again later";
  if (err instanceof TypeError) return "Cannot reach the read-aloud server. Please run start.ps1 first";
  return err?.message || "Reading failed";
}

// ------------------------------------------------------------ playback

function cancelled(my) {
  return my !== run;
}

async function whilePaused(my) {
  while (paused && !cancelled(my)) await new Promise((r) => setTimeout(r, 100));
}

// Waits for `ms` of un-paused time.
async function pause(ms, my) {
  for (let left = ms; left > 0 && !cancelled(my); left -= 100) {
    await whilePaused(my);
    await new Promise((r) => setTimeout(r, 100));
  }
}

let firstWordNow = 0; // words before this one are not pointed out; a jump from the bar resets it

// Tells the page which part of the original text is being spoken, whenever the word changes,
// and how far into the clip playback is (for the progress bar). Words before `firstWord` are
// not reported (playback may start a moment before that word).
function trackWords(piece, words, firstWord = 0) {
  const spans = alignWords(piece.text, words);
  let last = -1;
  let shown = "";
  firstWordNow = firstWord;
  return setInterval(() => {
    // In steps of 0.2 s, so the page gets a few updates a second rather than 25.
    const time = { current: Math.round(audio.currentTime * 5) / 5, duration: Number.isFinite(audio.duration) ? audio.duration : 0 };
    if (JSON.stringify(time) !== shown) {
      shown = JSON.stringify(time);
      chrome.runtime.sendMessage({ target: "background", type: "time", ...time }).catch(() => {});
    }
    const at = activeWord(words, audio.currentTime * 1000);
    if (at < firstWordNow || at === last) return;
    last = at;
    const span = spans[at];
    if (!span) return;
    const now = [toOriginal(piece, span[0]), toOriginal(piece, span[1] - 1) + 1];
    chrome.runtime.sendMessage({ target: "background", type: "progress", now }).catch(() => {});
  }, 40);
}

// Playback starts this long before the clicked word, so its first sound is not cut off.
const LEAD_IN = 0.08;

// Which piece holds position `at` of the original text, and where in that piece's clip to
// start: `seconds` into it, with `word` the index of the first word to point out.
function startPoint(pieces, at, clipFor) {
  let index = 0;
  pieces.forEach((p, i) => {
    if (p.segs[0][1] <= at) index = i;
  });
  const piece = pieces[index];
  let seg = piece.segs[0];
  for (const s of piece.segs) if (s[1] <= at) seg = s;
  const pos = Math.min(seg[0] + at - seg[1], piece.text.length - 1);
  return { index, pos, seconds: async () => {
    const { words } = await clipFor(index);
    const spans = alignWords(piece.text, words);
    const w = spans.findIndex((sp) => sp && sp[1] > pos);
    if (w <= 0 || at <= piece.segs[0][1]) return { seconds: 0, word: 0 };
    return { seconds: Math.max(0, words[w].start / 1000 - LEAD_IN), word: w };
  } };
}

async function playClip(piece, clip, from = 0, firstWord = 0) {
  const timer = trackWords(piece, clip.words, firstWord);
  try {
    await new Promise((resolve, reject) => {
      wake = resolve;
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("Playback failed"));
      audio.src = clip.url;
      if (from > 0) {
        // Jump only once the file's length is known; an earlier jump can be ignored.
        audio.onloadedmetadata = () => {
          audio.onloadedmetadata = null;
          audio.currentTime = from;
          if (!paused) audio.play().catch(reject);
        };
        audio.load();
      } else audio.play().catch(reject);
    });
  } finally {
    clearInterval(timer);
  }
}

async function play({ text, startAt = 0, settings: s, keepPaused = false }) {
  const my = ++run;
  abort?.abort();
  abort = new AbortController();
  const { signal } = abort;
  wake?.();
  audio.onloadedmetadata = null;
  audio.pause();
  paused = keepPaused;

  const pieces = splitText(text, s.split);
  if (!pieces.length) return emit({ state: "error", message: "There is no text to read" });
  const total = pieces.length;
  const clips = [];
  const clip = (i) => (clips[i] ??= synthesize(pieces[i].text, s, signal));
  s.repeat = Math.max(1, Math.min(20, s.repeat | 0));
  session = { text, settings: s, pieces, index: 0 };

  try {
    const first = startPoint(pieces, startAt, clip);
    for (let i = first.index; i < total; i++) {
      session.index = i;
      const info = () => ({ index: i, total, text, loop: Boolean(s.loop), startAt: i === first.index ? startAt : pieces[i].segs[0][1] });
      report("loading", info());
      const c = await clip(i);
      if (cancelled(my)) return;
      if (i + 1 < total) clip(i + 1).catch(() => {}); // start the next one while this one plays
      const { seconds: from, word } = i === first.index ? await first.seconds() : { seconds: 0, word: 0 };
      for (let r = 0; r < s.repeat || s.loop; r++) {
        await whilePaused(my);
        if (cancelled(my)) return;
        const start = r === 0 ? from : 0;
        report("playing", { ...info(), startAt: r === 0 ? info().startAt : pieces[i].segs[0][1], repeat: r + 1, repeats: s.repeat });
        await playClip(pieces[i], c, start, r === 0 ? word : 0);
        if (cancelled(my)) return;
        const last = i === total - 1 && r + 1 >= s.repeat && !s.loop;
        if (s.gap > 0 && !last) {
          report("waiting", { ...info(), repeat: r + 1, repeats: s.repeat });
          await pause(Math.max(0, c.duration - start * 1000) * s.gap, my);
        }
      }
    }
    if (!cancelled(my)) emit({ ...status, state: "idle" });
  } catch (err) {
    if (!cancelled(my)) emit({ state: "error", message: friendly(err) });
  }
}

function stop() {
  run++;
  abort?.abort();
  wake?.();
  audio.onloadedmetadata = null;
  audio.pause();
  paused = false;
  emit({ ...status, state: "idle" });
}

function navigate(delta) {
  if (!session) return;
  const index = session.index + delta;
  if (index < 0 || index >= session.pieces.length) return;
  play({ text: session.text, settings: session.settings, startAt: session.pieces[index].segs[0][1], keepPaused: paused });
}

function practice(repeat, loop) {
  if (!session) return;
  if (Number.isFinite(repeat)) session.settings.repeat = Math.max(1, Math.min(20, repeat | 0));
  if (typeof loop === "boolean") session.settings.loop = loop;
  emit({ ...status, repeats: session.settings.repeat, loop: Boolean(session.settings.loop) });
}

// Jump within the clip being played (from the progress bar on the page). Only while a clip
// is playing or paused in the middle, not during the pause for speaking along.
function seek(seconds) {
  if (doing !== "playing" || !Number.isFinite(audio.duration)) return;
  audio.currentTime = Math.max(0, Math.min(seconds, audio.duration - 0.05));
  firstWordNow = 0;
}

function setPaused(value) {
  if (status.state === "idle" || status.state === "error") return;
  paused = value;
  if (value) audio.pause();
  else if (doing === "playing" && audio.src && audio.paused && !audio.ended) audio.play().catch(() => {});
  emit({ ...status, state: value ? "paused" : doing });
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.target !== "offscreen") return;
  switch (msg.type) {
    case "play":
      play(msg);
      break;
    case "stop":
      stop();
      break;
    case "pause":
      setPaused(true);
      break;
    case "resume":
      setPaused(false);
      break;
    case "toggle":
      setPaused(!paused);
      break;
    case "seek":
      seek(msg.seconds);
      break;
    case "previous":
      navigate(-1);
      break;
    case "next":
      navigate(1);
      break;
    case "practice":
      practice(msg.repeat, msg.loop);
      break;
    case "getState":
      reply(status);
      break;
  }
});
