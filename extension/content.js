// Reading and highlighting for our Read-Aloud Study page only. Nothing is mounted on MOJi's
// other pages, and their text clicks are left to MOJi.
(() => {
  const study = {};
  let state = "idle";
  let phase = "idle";
  let index = null;
  let current = null;
  let time = null;
  let scrubbing = false;
  let gone = false;
  let repeat = 1;
  let loop = false;
  const active = () => ["loading", "playing", "waiting", "paused"].includes(state);
  const BLOCKS = new Set(["block", "flex", "grid", "list-item", "table-cell", "flow-root"]);

  // The visible text inside `root` (only the part inside `range`, if given) without furigana,
  // plus the text nodes it came from and where each one starts in it. MOJi puts blank
  // text nodes between words; they are not part of the sentence, so they are skipped.
  function collect(root, range) {
    if (root.nodeType === Node.TEXT_NODE) root = root.parentElement;
    const nodes = [];
    let text = "";
    let lastBlock = null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        /^\s*$/.test(n.data) || n.parentElement?.closest("rt, rp, [data-tts-skip]") || !n.parentElement?.checkVisibility()
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    for (let n; (n = walker.nextNode()); ) {
      if (range && !range.intersectsNode(n)) continue;
      const a = n === range?.startContainer ? range.startOffset : 0;
      const b = n === range?.endContainer ? range.endOffset : n.length;
      if (b <= a) continue;
      // A line break where a new paragraph starts, so paragraphs are not run together.
      const block = blockOf(n.parentElement);
      if (lastBlock && block !== lastBlock && !text.endsWith("\n")) text += "\n";
      lastBlock = block;
      nodes.push({ node: n, a, b, start: text.length });
      text += n.data.slice(a, b);
    }
    return { text, nodes };
  }

  function blockOf(el) {
    while (el && !BLOCKS.has(getComputedStyle(el).display)) el = el.parentElement;
    return el;
  }

  function clearMarks() {
    CSS.highlights?.delete("tts-now");
    CSS.highlights?.delete("tts-done");
  }

  // Position of `offset` (in current.text) as [text node, index in it].
  function locate(offset, isEnd) {
    const nodes = current.nodes;
    for (const e of nodes) {
      const len = e.b - e.a;
      if (isEnd ? offset > e.start && offset <= e.start + len : offset >= e.start && offset < e.start + len) {
        return [e.node, e.a + offset - e.start];
      }
    }
    return null;
  }

  function mark([from, to]) {
    if (!current || !CSS.highlights) return;
    const a = locate(current.base + from, false);
    const b = locate(current.base + to, true);
    const first = locate(current.base + current.startAt, false);
    if (!a || !b || !first) return;
    try {
      const now = new Range();
      now.setStart(...a);
      now.setEnd(...b);
      const done = new Range();
      done.setStart(...first);
      done.setEnd(...a);
      CSS.highlights.set("tts-done", new Highlight(done));
      CSS.highlights.set("tts-now", new Highlight(now));
    } catch {
      clearMarks(); // the page replaced those text nodes
    }
  }


  const h = (tag, props = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === "class") el.className = value;
      else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
      else if (key in el) el[key] = value;
      else el.setAttribute(key, value);
    }
    el.append(...children);
    return el;
  };
  function send(msg) {
    if (gone) return;
    try { chrome.runtime.sendMessage({ target: "background", ...msg }); }
    catch { say("The extension was updated, please refresh the page"); }
  }
  const control = (action, extra = {}) => send({ type: "control", action, ...extra });
  const previous = h("button", { type: "button", class: "st-player-secondary", title: "Previous sentence", "aria-label": "Previous sentence", onclick: () => control("previous") }, "Previous");
  const play = h("button", { type: "button", class: "st-player-play", onclick: () => {
    if (active()) control("toggle");
    else {
      const root = study.textRoot?.();
      if (root) read({ ...collect(root), from: 0 });
      else read(null, study.inputText?.() ?? "");
    }
  } }, "Read all");
  const next = h("button", { type: "button", class: "st-player-secondary", title: "Next sentence", "aria-label": "Next sentence", onclick: () => control("next") }, "Next");
  const stop = h("button", { type: "button", class: "st-player-secondary", onclick: () => control("stop") }, "Stop");
  const position = h("span", { class: "st-player-position" }, "Sentence by sentence");
  const repeatSelect = h("select", { "aria-label": "Repeats per sentence", onchange: () => {
    repeat = Number(repeatSelect.value);
    chrome.storage.sync.set({ repeat });
    control("practice", { repeat, loop });
  } }, ...[1, 2, 3, 5].map(n => h("option", { value: String(n) }, `${n}x`)));
  const loopButton = h("button", { type: "button", class: "st-player-loop", "aria-pressed": "false", title: "Keep repeating the current sentence until you turn this off or change sentence", onclick: () => {
    loop = !loop;
    loopButton.setAttribute("aria-pressed", String(loop));
    control("practice", { repeat, loop });
  } }, "Loop sentence");
  const progress = h("input", { type: "range", class: "st-player-progress", min: "0", max: "1000", value: "0", step: "1", "aria-label": "Playback position in the current sentence" });
  const clock = h("span", { class: "st-player-clock" }, "0:00 / 0:00");
  const message = h("div", { class: "st-player-message", role: "status", "aria-live": "polite" });
  const player = h("div", { class: "st-player", "aria-label": "Read-aloud player" },
    h("div", { class: "st-player-controls" }, previous, play, next, stop, position,
      h("span", { class: "st-grow" }), h("label", { class: "st-player-repeat" }, "Repeat", repeatSelect), loopButton),
    h("div", { class: "st-player-timeline" }, progress, clock), message);
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  let toastTimer;
  function say(text, ms = 2500) {
    if (gone) return;
    message.textContent = text;
    clearTimeout(toastTimer);
    if (ms) toastTimer = setTimeout(() => (message.textContent = ""), ms);
  }
  function drawBar() {
    const known = time?.duration > 0 && phase === "playing" && ["playing", "paused"].includes(state);
    progress.disabled = !known;
    if (!scrubbing) progress.value = known ? String(Math.min(1000, time.current / time.duration * 1000)) : "0";
    const at = known ? Number(progress.value) / 1000 * time.duration : 0;
    clock.textContent = `${fmt(at)} / ${fmt(known ? time.duration : 0)}`;
    progress.setAttribute("aria-valuetext", clock.textContent);
  }
  progress.addEventListener("input", () => { scrubbing = true; drawBar(); });
  progress.addEventListener("change", () => {
    if (time?.duration) {
      const seconds = Number(progress.value) / 1000 * time.duration;
      control("seek", { seconds });
      time = { ...time, current: seconds };
    }
    scrubbing = false;
    drawBar();
  });
  progress.addEventListener("pointercancel", () => { scrubbing = false; drawBar(); });
  function render(s) {
    state = s.state;
    phase = s.phase ?? s.state;
    if (index !== s.index || phase === "loading" || !active()) { time = null; scrubbing = false; clearMarks(); }
    index = s.index;
    if (current && Number.isFinite(s.startAt)) current.startAt = s.startAt;
    play.textContent = active() ? state === "paused" ? "Resume" : "Pause" : "Read all";
    play.disabled = state === "loading";
    stop.disabled = !active();
    previous.disabled = !(s.index > 0);
    next.disabled = !(s.index + 1 < s.total);
    position.textContent = s.total ? `Sentence ${s.index + 1} / ${s.total}` : "Sentence by sentence";
    if (typeof s.loop === "boolean") { loop = s.loop; loopButton.setAttribute("aria-pressed", String(loop)); }
    if (s.state === "error") say(s.message || "Reading failed", 0);
    else if (s.state === "loading") say("Preparing the current sentence...", 0);
    else if (s.state === "waiting") say("Your turn to speak", 0);
    else if (s.state === "paused") say("Paused", 0);
    else if (s.state === "playing") say(loop ? "Looping the current sentence" : s.repeats > 1 ? `Play ${s.repeat} / ${s.repeats}` : "", 0);
    else say("", 0);
    if (!active()) clearMarks();
    drawBar();
  }
  function read(src, text) {
    if (!study.isOpen?.()) return;
    clearMarks();
    let startAt = 0;
    if (src) {
      text = src.text.trim();
      const lead = src.text.length - src.text.trimStart().length;
      startAt = Math.max(0, src.from - lead);
      current = { ...src, base: lead, startAt };
    } else current = null;
    if (text?.trim()) send({ type: "read", text, startAt, practice: { repeat, loop, split: true } });
    else say("Type some Japanese first");
  }
  function sayStart(src) {
    if (src.from > 0) say("Reading from \"" + src.text.slice(src.from, src.from + 8) + "\"");
  }
  function relayout() {
    const host = study.playerRoot?.();
    if (host && player.parentElement !== host) host.append(player);
    if (!study.isOpen?.()) clearMarks();
  }
  chrome.runtime.onMessage.addListener(msg => {
    if (gone) return;
    if (msg?.type === "state") render(msg.state);
    else if (msg?.type === "progress" && study.isOpen?.()) mark(msg.now);
    else if (msg?.type === "time" && active() && phase === "playing") { time = { current: msg.current, duration: msg.duration }; drawBar(); }
  });
  chrome.storage.sync.get({ repeat }).then(v => {
    if (gone) return;
    repeat = [1, 2, 3, 5].includes(v.repeat) ? v.repeat : 1;
    repeatSelect.value = String(repeat);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (gone || area !== "sync" || !changes.repeat) return;
    repeat = [1, 2, 3, 5].includes(changes.repeat.newValue) ? changes.repeat.newValue : 1;
    repeatSelect.value = String(repeat);
    control("practice", { repeat, loop });
  });
  function leaveStudy() {
    if (active()) control("stop");
    clearMarks();
  }
  document.dispatchEvent(new Event("moji-tts-replace"));
  document.addEventListener("moji-tts-replace", () => {
    gone = true;
    clearTimeout(toastTimer);
    clearMarks();
    player.remove();
  }, { once: true });
  globalThis.mojiTts = { study, collect, read, say, sayStart, relayout, leaveStudy, active };
  render({ state: "idle" });
})();
