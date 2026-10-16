// Our own study page on mojidict.com: Japanese goes in at the top; below it comes MOJi's
// translation, sentence by sentence, with every word shown with its kana, dictionary form
// and grammar. Clicking a word reads the text aloud from there.
//
// It opens from an item added to MOJi's left menu and covers the rest of MOJi's page while
// open. The words come from the local server (quick, and it works offline). MOJi's
// translation and its own analysis come from two MOJi pages kept hidden in the background
// (see moji-frame.js); they fill in the translation, the meaning of each word, and how the
// sentence splits into phrases.
(() => {
  const tts = globalThis.mojiTts;
  if (!tts || location.hostname !== "www.mojidict.com") return;
  // Chinese names for the word labels (grammar.js).
  const { POS_SHORT, wordClass, verbGroup } = globalThis.mojiGrammar;
  // Work on the text that needs no page (study-text.js).
  const { sameText, roughTokens, OPENING, CLOSING, phraseStarts, translationLines, levelOf, ...studyText } = globalThis.mojiStudyText;

  const MAX = 2000; // MOJi's translate page takes at most this many characters
  const MAX_ANALYSE = 1000; // and its analysis page this many
  const HASH = "#tts-study";

  let readToEnd = true;
  let autoRead = false;
  // translate: which service translates: "google", "bing", "moji" (uses MOJi's AI points) or "off".
  // main: sentence core in yellow; pos: word class written under each word ("text") or as a
  // coloured underline ("line"); verb: verb groups named Godan/Ichidan ("godan") or Group 1/Group 2
  // ("class"); lemma: the dictionary form under words that are not in it; gram: the grammar
  // patterns found in each sentence, under it.
  let prefs = { kana: "show", trans: "show", translate: "google", main: "off", pos: "off", verb: "off", lemma: "off", gram: "on" };
  const SERVICES = { google: "Google", bing: "Bing", moji: "MOJi" };

  // What is on the page: the text, and what is known about it so far. `transBy` is the
  // service the translation is from (or being asked of). `grammar` is what the local server
  // found (/api/grammar): { found: [{ id, words, start, end }], patterns: { id: {...} } }.
  let data = blank("");
  function blank(text) {
    return { text, tokens: null, sentences: null, transDone: false, transBy: null, words: [], phrases: null, grammar: null };
  }
  // MOJi's last translation. MOJi does not translate the same text twice in a row, so going
  // back to MOJi for it (after trying another service) uses this.
  let lastMoji = null;
  // Progress of each part, shown under the text box: { text, busy, error }.
  const status = { local: null, trans: null, ana: null, gram: null };

  // ---------------------------------------------------------------- building blocks

  const h = (tag, props = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k in el && k !== "list") el[k] = v;
      else el.setAttribute(k, v);
    }
    el.append(...children.flat().filter((c) => c != null && c !== false));
    return el;
  };

  const sheet = h("link", { rel: "stylesheet", href: chrome.runtime.getURL("study.css") });

  const input = h("textarea", {
    class: "st-text",
    placeholder: "Type or paste Japanese, then press Ctrl+Enter to translate and analyze",
    maxLength: MAX,
    spellcheck: false,
  });
  const count = h("span", { class: "st-count" });
  const serviceSelect = h(
    "select",
    { class: "st-service", title: "Who translates. Google and Bing are free through the local read-aloud server; MOJi uses its AI points" },
    h("option", { value: "google" }, "Google"),
    h("option", { value: "bing" }, "Bing"),
    h("option", { value: "moji" }, "MOJi (uses points)"),
    h("option", { value: "off" }, "No translation"),
  );
  const clearButton = h("button", { class: "st-clear", type: "button" }, "Clear");
  const goButton = h("button", { class: "st-go", type: "button" }, "Translate and analyze");
  const statusLine = h("div", { class: "st-status" });
  const rowsEl = h("div", { class: "st-rows" });
  const wordsEl = h("div", { class: "st-words" });
  const wordsTitle = h("h3", {}, "Words");
  const gramEl = h("div", { class: "st-grams" });
  const gramTitle = h("h3", {}, "Patterns");
  const pop = h("div", { class: "st-pop" });
  const playerRoot = h("div", { class: "st-player-host" });

  const seg = (name, options) =>
    h(
      "span",
      { class: "st-seg", "data-pref": name },
      options.map(([value, label]) => h("button", { type: "button", "data-value": value, onclick: () => setPref(name, value) }, label)),
    );

  // What else to show on the text, like the display settings of MOJi's analysis page.
  const POS_COLOURS = [["noun", "Noun"], ["verb", "Verb"], ["adj", "Adjective"], ["adv", "Adverb"], ["particle", "Particle"], ["aux", "Auxiliary"]];
  const viewButton = h("button", { type: "button", class: "st-view-button", "aria-expanded": "false" }, "Display");
  const viewPanel = h(
    "div",
    { class: "st-view" },
    h("div", { class: "st-view-row" }, h("span", { title: "The last phrase the sentence lands on, plus the phrases that directly describe it. Needs MOJi's analysis" }, "Sentence core"), seg("main", [["off", "Off"], ["on", "Yellow"]])),
    h("div", { class: "st-view-row" }, h("span", {}, "Word class"), seg("pos", [["off", "Off"], ["text", "Text"], ["line", "Line"]])),
    h("div", { class: "st-view-legend" }, POS_COLOURS.map(([c, name]) => h("span", { "data-pc": c }, name))),
    h("div", { class: "st-view-row" }, h("span", {}, "Verb group"), seg("verb", [["off", "Off"], ["godan", "Godan"], ["class", "Group 1"]])),
    h("div", { class: "st-view-row" }, h("span", { title: "List the grammar patterns of each sentence under it; point at one for an explanation" }, "Patterns"), seg("gram", [["off", "Off"], ["on", "Show"]])),
    h("div", { class: "st-view-row" }, h("span", { title: "Write the dictionary form under a changed word; for loanwords, the original word, e.g. coffee for コーヒー" }, "Base form"), seg("lemma", [["off", "Off"], ["on", "Show"]])),
  );
  viewButton.addEventListener("click", () => showViewPanel(!viewPanel.classList.contains("is-open")));
  function showViewPanel(on) {
    viewPanel.classList.toggle("is-open", on);
    viewButton.setAttribute("aria-expanded", String(on));
  }
  addEventListener("mousedown", (e) => {
    if (viewPanel.classList.contains("is-open") && !e.composedPath().some((el) => el === viewPanel || el === viewButton)) showViewPanel(false);
  });

  const page = h(
    "div",
    { class: "moji-tts-study" },
    h(
      "div",
      { class: "st-page" },
      h("div", { class: "st-head" }, h("h1", {}, "Read-Aloud Study"), h("p", {}, "Click any word to read aloud from there; hover a word to see its reading, base form and meaning")),
      h(
        "div",
        { class: "st-card st-input" },
        input,
        h("div", { class: "st-bar" }, count, h("label", { class: "st-check" }, "Translate", serviceSelect), clearButton, h("span", { class: "st-grow" }), goButton),
      ),
      statusLine,
      h(
        "div",
        { class: "st-body" },
        h(
          "div",
          { class: "st-card st-result" },
          h(
            "div",
            { class: "st-tools" },
            h("span", {}, "Kana"),
            seg("kana", [["show", "Show"], ["hover", "On hover"], ["off", "Off"]]),
            h("span", {}, "Translation"),
            seg("trans", [["show", "Show"], ["hover", "On hover"]]),
            h("span", { class: "st-grow" }),
            viewButton,
            viewPanel,
          ),
          rowsEl,
        ),
        h("div", { class: "st-card st-side" }, gramTitle, gramEl, wordsTitle, wordsEl),
      ),
    ),
    pop,
    playerRoot,
  );

  // ---------------------------------------------------------------- opening and closing

  let menuItem = null;

  // A copy of one of MOJi's own menu items, so it picks up the same look.
  function makeMenuItem(model) {
    const item = model.cloneNode(true);
    item.classList.remove("active");
    item.classList.add("moji-tts-menu");
    item.removeAttribute("ga-event");
    const link = item.querySelector("a") ?? item;
    link.setAttribute("href", HASH);
    const title = item.querySelector(".menu-item-title");
    const icon = h("span", { class: "moji-tts-menu-icon" }, "読");
    for (const a of title?.attributes ?? []) if (a.name.startsWith("data-v-")) icon.setAttribute(a.name, "");
    item.querySelectorAll("img, sup").forEach((el) => el.remove());
    link.prepend(icon);
    if (title) {
      title.textContent = "Read-Aloud Study";
      title.removeAttribute("ga-event");
    }
    item.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      open();
    });
    return item;
  }

  function placeMenuItem() {
    const menu = document.querySelector(".sidebar-menu");
    if (!menu || (menuItem && menu.contains(menuItem))) return;
    const trans = menu.querySelector('a[href="/trans"]')?.closest(".menu-item");
    const model = trans ?? menu.querySelector(".menu-item");
    if (!model) return;
    menuItem = makeMenuItem(model);
    model.after(menuItem);
    markMenu();
  }

  // While our page is open, our item is the one shown as chosen (MOJi's "active").
  let mojiActive = null;
  function markMenu() {
    const open = isOpen();
    menuItem?.classList.toggle("active", open);
    if (open) {
      const other = document.querySelector(".sidebar-menu .menu-item.active:not(.moji-tts-menu)");
      if (other) (mojiActive = other), other.classList.remove("active");
    } else if (mojiActive) {
      if (mojiActive.isConnected && !document.querySelector(".sidebar-menu .menu-item.active")) mojiActive.classList.add("active");
      mojiActive = null;
    }
  }

  const isOpen = () => document.documentElement.classList.contains("moji-tts-studying");

  // MOJi takes #tts-study off the address, so a refresh would not know our page was open.
  // This tab's own storage remembers it instead (gone when the tab is closed).
  const OPEN_KEY = "mojiTtsStudyOpen";

  function open() {
    document.documentElement.classList.add("moji-tts-studying");
    sessionStorage.setItem(OPEN_KEY, "1");
    markMenu();
    if (location.hash !== HASH) history.replaceState(history.state, "", location.pathname + location.search + HASH);
    place();
    spaceNotes();
    if (!input.value) input.focus();
    tts.relayout();
  }

  function close() {
    if (!isOpen()) return;
    tts.leaveStudy();
    document.documentElement.classList.remove("moji-tts-studying");
    sessionStorage.removeItem(OPEN_KEY);
    markMenu();
    card.hide();
    if (location.hash === HASH) history.replaceState(history.state, "", location.pathname + location.search);
    tts.relayout();
  }

  // Any other item in MOJi's menu goes back to MOJi.
  addEventListener(
    "click",
    (e) => {
      if (gone || !isOpen()) return;
      const item = e.target.closest?.(".sidebar-menu .menu-item, .sidebar-logo");
      if (item && item !== menuItem) close();
    },
    true,
  );

  // The page starts where MOJi's left menu ends, and follows it when it gets wider or
  // narrower (MOJi folds it up in narrow windows).
  const menuSize = new ResizeObserver(() => isOpen() && place());
  let watched = null;
  function place() {
    const box = document.querySelector(".sidebar-container");
    const menu = document.querySelector(".sidebar-inner") ?? box;
    if (menu && menu !== watched) watched && menuSize.unobserve(watched), menuSize.observe((watched = menu));
    const right = menu?.checkVisibility() ? Math.round(Math.max(box?.getBoundingClientRect().right ?? 0, menu.getBoundingClientRect().right)) : 0;
    page.style.setProperty("--st-left", right + "px");
    tts.relayout();
  }
  addEventListener("resize", () => isOpen() && place());

  // The player belongs to this page; MOJi's other pages get no injected controls.
  tts.study.isOpen = isOpen;
  tts.study.playerRoot = () => playerRoot;
  tts.study.inputText = () => input.value;
  tts.study.textRoot = () => (isOpen() && rowsEl.querySelector(".st-w") ? rowsEl : undefined);

  // ---------------------------------------------------------------- the hidden MOJi pages

  const frames = {};

  // Create a bridge only when ask() needs it. Eager hidden pages on refresh can keep
  // Chrome waiting for their resources even after the saved study content is visible.
  function frame(name) {
    if (frames[name]) return frames[name];
    const el = h("iframe", { src: "/" + name, tabIndex: -1, "aria-hidden": "true", class: "moji-tts-frame" });
    const f = (frames[name] = { name, el, ready: false, waiting: null });
    el.addEventListener("load", () => {
      f.ready = false;
      try {
        const doc = el.contentDocument;
        doc.documentElement.append(Object.assign(doc.createElement("script"), { src: chrome.runtime.getURL("moji-frame.js") }));
      } catch {
        setStatus(name, { error: "Could not open the MOJi page" });
      }
    });
    document.documentElement.append(el);
    return f;
  }

  function ask(name, text) {
    const f = frame(name);
    f.waiting = text;
    if (f.ready) flush(f);
    // In case the page never answers (not logged in, the page changed, the network).
    clearTimeout(f.timer);
    f.timer = setTimeout(() => {
      if (name === "trans" && data.transBy !== "moji") return;
      if (sameText(text, data.text) && status[name]?.busy) setStatus(name, { error: name === "trans" ? "MOJi did not answer the translation" : "MOJi did not answer the analysis" });
    }, 45000);
  }

  function flush(f) {
    if (f.waiting == null) return;
    f.el.contentWindow.postMessage({ mojiTtsStudy: true, text: f.waiting }, location.origin);
    f.waiting = null;
  }

  addEventListener("message", (e) => {
    if (gone || e.origin !== location.origin || !e.data?.mojiTtsFrame) return;
    const f = Object.values(frames).find((f) => f.el.contentWindow === e.source);
    if (!f) return;
    const d = e.data;
    if (d.kind === "ready") return (f.ready = true), flush(f);
    if (typeof d.text !== "string" || !data.text || !sameText(d.text, data.text)) return; // for an older text
    if (d.kind === "translation") lastMoji = { text: d.text, sentences: d.sentences.map(({ src, dst }) => ({ src, dst })) };
    // Another service was picked for the translation meanwhile.
    if (f.name === "trans" && data.transBy !== "moji") return d.kind === "translation" && addWords(d.words);
    switch (d.kind) {
      case "partial":
        if (data.transDone) return;
        data.sentences = d.sentences;
        return paintTranslation();
      case "translation":
        clearTimeout(f.timer);
        useTranslation(lastMoji.sentences);
        return addWords(d.words);
      case "phrases":
        clearTimeout(f.timer);
        data.phrases = d.sentences;
        setStatus("ana", null);
        useMojiReadings();
        layoutRows();
        return save();
      case "words":
        return addWords(d.words), save();
      case "same": // MOJi has this text translated already; its answer came earlier
        if (!data.transDone) setStatus("trans", { error: "MOJi did not translate again. Change the text a little and try again" });
        return;
      case "error":
      case "notice":
        if (f.name === "trans" && data.transDone) return;
        if (f.name === "ana" && data.phrases) return;
        clearTimeout(f.timer);
        return setStatus(f.name, { error: d.message });
    }
  });

  // ---------------------------------------------------------------- running

  async function run() {
    const text = input.value.trim();
    if (!text) return tts.say("Type some Japanese above first");
    if (sameText(text, data.text) && data.tokens) {
      // Same text: only fill in what is missing (or failed), and a translation from the
      // service now picked.
      if (!status.trans?.busy && !(data.transDone && data.transBy === prefs.translate)) startTranslation();
      if (!data.phrases && !status.ana?.busy && text.length <= MAX_ANALYSE) startAnalysis(text);
      if (status.local?.error) await analyseHere(text);
      else if (!data.grammar && !status.gram?.busy) findGrammar(text);
      if (autoRead) readAll();
      return;
    }
    card.hide();
    data = blank(text);
    tokenEls = [];
    rowsEl.replaceChildren(h("div", { class: "st-empty" }, "Analyzing..."));
    rows = [];
    paintWords();
    paintGrammar();
    setStatus("trans", null);
    // MOJi works from the text itself; the others get it row by row, once the rows are known.
    if (prefs.translate === "moji") startTranslation();
    if (text.length <= MAX_ANALYSE) startAnalysis(text);
    else setStatus("ana", { error: `Over ${MAX_ANALYSE} characters, so MOJi does not analyze phrases` });
    await analyseHere(text);
    if (gone || data.text !== text) return;
    if (prefs.translate !== "moji") startTranslation();
    if (autoRead) readAll();
  }

  // The words, readings and grammar from the local server.
  async function analyseHere(text) {
    setStatus("local", { text: "Splitting words...", busy: true });
    const res = await chrome.runtime.sendMessage({ target: "background", type: "analyze", text }).catch(() => null);
    if (gone || data.text !== text) return;
    if (res?.result) {
      data.tokens = res.result;
      setStatus("local", null);
      findGrammar(text);
    } else {
      data.tokens = roughTokens(text);
      setStatus("local", { error: (res?.error ?? "Extension error, please refresh the page") + ". Readings and base forms are missing for now" });
    }
    tokenEls = [];
    useMojiReadings();
    makeTokens();
    layoutRows();
    save();
  }

  // The grammar patterns in the text (from the local server, like the words).
  async function findGrammar(text) {
    setStatus("gram", { text: "Finding patterns...", busy: true });
    const res = await chrome.runtime.sendMessage({ target: "background", type: "grammar", text }).catch(() => null);
    if (gone || data.text !== text) return;
    // (The side list says what went wrong too, so it is painted again.)
    if (!res?.result) return setStatus("gram", { error: res?.error ?? "Extension error, please refresh the page" }), paintGrammar();
    setStatus("gram", null);
    data.grammar = res.result;
    paintGrammar();
    save();
  }

  // Translate data.text with the service picked above the text.
  async function startTranslation() {
    const service = prefs.translate;
    const text = data.text;
    if (service === "off" || !text) return;
    data.transBy = service;
    data.transDone = false;
    if (service === "moji") {
      if (lastMoji && sameText(lastMoji.text, text)) return useTranslation(lastMoji.sentences);
      setStatus("trans", { text: "MOJi…", busy: true });
      return ask("trans", text);
    }
    // Google and Bing (through the local server) get one row, one sentence, at a time, so
    // each translation lands under its own sentence.
    if (!rows.length) return; // the rows come with the words; this is called again then
    const lines = rows.map((r) => text.slice(r.start, r.end).trim());
    setStatus("trans", { text: `${SERVICES[service]}…`, busy: true });
    const res = await chrome.runtime.sendMessage({ target: "background", type: "translate", service, lines }).catch(() => null);
    if (gone || data.text !== text || data.transBy !== service) return; // something newer was asked for
    if (!res?.result?.lines) return setStatus("trans", { error: res?.error ?? "Extension error, please refresh the page" });
    useTranslation(lines.map((src, i) => ({ src, dst: res.result.lines[i] ?? "" })).filter((s) => s.src));
  }

  function useTranslation(sentences) {
    data.sentences = sentences;
    data.transDone = true;
    setStatus("trans", null);
    paintTranslation();
    save();
  }

  function startAnalysis(text) {
    setStatus("ana", { text: "Analyzing phrases...", busy: true });
    ask("ana", text);
  }

  function setStatus(name, value) {
    status[name] = value;
    const label = { local: "Local word split", trans: "Translation", ana: "MOJi analysis", gram: "Patterns" };
    statusLine.replaceChildren(
      ...Object.entries(status)
        .filter(([, v]) => v)
        .map(([k, v]) => h("span", { class: "st-chip" + (v.error ? " is-error" : v.busy ? " is-busy" : "") }, `${label[k]}：${v.error ?? v.text}`)),
    );
  }

  // ---------------------------------------------------------------- the text, word by word

  let tokenEls = [];

  function makeTokens() {
    const text = data.text;
    tokenEls = data.tokens.map((t, i) => {
      const el = h("span", { class: "st-w" });
      el.dataset.i = i;
      if (["助詞", "助動詞"].includes(t.pos[0])) el.classList.add("st-func");
      if (t.pos[0] === "補助記号" || !/[\p{L}\p{N}]/u.test(t.surface)) el.classList.add("st-punct");
      fillToken(el, t, text);
      return el;
    });
    markKnownWords();
  }

  function fillToken(el, t, text) {
    const parts = [];
    let at = t.start;
    for (const [s, e, r] of t.ruby) {
      if (s > at) parts.push(text.slice(at, s));
      parts.push(h("ruby", {}, text.slice(s, e), h("rt", {}, r)));
      at = e;
    }
    if (at < t.end) parts.push(text.slice(at, t.end));
    el.replaceChildren(...parts, ...notesFor(t, data.tokens?.[+el.dataset.i - 1]));
    const c = wordClass(t);
    if (c) el.dataset.pc = c;
    else delete el.dataset.pc;
  }

  // ---------------------------------------------------------------- notes on the words

  // What goes under a word besides its kana: its dictionary form (or the word a loanword
  // comes from), then its word class and verb group. Not read aloud.
  function notesFor(t, prev) {
    if (t.pos[0] === "補助記号" || !/[\p{L}\p{N}]/u.test(t.surface)) return [];
    const under = [];
    if (prefs.lemma === "on" && !["助詞", "助動詞"].includes(t.pos[0])) {
      const lemma = t.origin || (t.base && t.base !== t.surface ? t.base : "");
      if (lemma) under.push(h("span", { class: "st-lemma", lang: t.origin ? "en" : "ja" }, lemma));
    }
    // Not on the helper verbs after て (the いる of 〜ている, the しまう of 〜てしまう).
    const helper = t.pos[1] === "非自立可能" && prev?.pos[1] === "接続助詞";
    const kind = [prefs.pos === "text" ? POS_SHORT[t.pos[0]] : "", prefs.verb !== "off" && !helper ? verbGroup(t, prefs.verb) : ""].filter(Boolean);
    if (kind.length) under.push(h("span", { class: "st-posl" }, kind.join(" ")));
    return under.length ? [h("span", { class: "st-under", "data-tts-skip": "" }, under)] : [];
  }

  // After a change of settings: the notes again on every word, and room for them.
  function paintNotes() {
    rowsEl.dataset.under = String((prefs.lemma === "on") + (prefs.pos === "text" || prefs.verb !== "off"));
    if (!data.tokens) return;
    tokenEls.forEach((el, i) => fillToken(el, data.tokens[i], data.text));
    spaceNotes();
    tts.relayout();
  }

  // A word whose notes are wider than itself gets room on both sides, so the notes of
  // neighbouring words do not run into each other.
  function spaceNotes() {
    if (!isOpen()) return; // nothing can be measured while the page is hidden; done on opening
    const widths = tokenEls.map((el) => {
      const under = el.querySelector(".st-under");
      el.style.margin = "";
      return under ? under.getBoundingClientRect().width - el.getBoundingClientRect().width : -Infinity;
    });
    tokenEls.forEach((el, i) => {
      if (widths[i] > -4) el.style.margin = `0 ${Math.ceil(widths[i] / 2) + 2}px`;
    });
  }

  // MOJi's analysis also gives a reading for each word, and it is usually the better one,
  // so it replaces ours (study-text.js).
  function useMojiReadings() {
    if (!data.tokens || !data.phrases) return;
    for (const i of studyText.useMojiReadings(data.tokens, data.text, data.phrases)) {
      if (tokenEls[i]) fillToken(tokenEls[i], data.tokens[i], data.text);
    }
  }

  let rows = []; // { start, end, el, zh }
  let phraseEls = new Map(); // start offset -> phrase element

  // Sentences one per row, each cut into phrases. Built again when MOJi's phrases come in;
  // the word elements themselves are kept, so reading that has begun keeps its marks.
  function layoutRows() {
    if (!data.tokens) return;
    if (!tokenEls.length) makeTokens();
    const text = data.text;
    const { starts, core: coreStarts } = phraseStarts(data.tokens, text, data.phrases);
    rows = [];
    phraseEls = new Map();
    const links = [];
    let row = null;
    let phrase = null;
    let newParagraph = true;
    let endSentence = false;
    let depth = 0; // inside quotes or brackets, where 。 and ？ do not end the sentence
    let at = 0;

    const startRow = (start) => {
      row = { start, end: start, el: h("div", { class: "st-row" + (newParagraph && rows.length ? " st-para" : "") }), zh: null };
      row.jp = h("div", { class: "st-jp", lang: "ja" });
      row.el.append(row.jp);
      rows.push(row);
      newParagraph = false;
      endSentence = false;
      phrase = null;
    };
    const startPhrase = (start) => {
      phrase = h("span", { class: "st-phrase" + (coreStarts.has(start) ? " st-core" : "") });
      phrase.dataset.at = start;
      phraseEls.set(start, phrase);
      row.jp.append(phrase);
    };
    const gap = (s) => {
      for (const [i, part] of s.split(/\n/).entries()) {
        if (i > 0) (row = null), (newParagraph = true), (depth = 0);
        if (!part) continue;
        if (!row) startRow(at);
        if (!phrase) startPhrase(at);
        phrase.append(part);
      }
    };

    data.tokens.forEach((t, i) => {
      gap(text.slice(at, t.start));
      at = t.start;
      const closing = CLOSING.test(t.surface);
      if (OPENING.test(t.surface)) depth++;
      else if (closing) depth = Math.max(0, depth - 1);
      if (endSentence && !closing) row = null;
      if (!row) startRow(t.start);
      if (!phrase || (starts.has(t.start) && !closing)) {
        startPhrase(t.start);
        if (starts.get(t.start) >= 0) links.push([phrase, starts.get(t.start)]);
      }
      phrase.append(tokenEls[i]);
      row.end = t.end;
      at = t.end;
      if (!depth && (/^[。．！？!?…]+$/.test(t.surface) || t.pos[1] === "句点")) endSentence = true;
    });
    gap(text.slice(at));

    for (const [el, to] of links) if (phraseEls.has(to)) el.dataset.to = to;
    rowsEl.classList.toggle("has-links", !!data.phrases);
    rowsEl.replaceChildren(...rows.map((r) => r.el));
    spaceNotes();
    paintGrammar();
    paintTranslation();
    tts.relayout();
  }

  // MOJi's sentences are matched to our rows by where their text starts.
  function paintTranslation() {
    if (!rows.length) return;
    const lines = translationLines(data.sentences, data.text, rows);
    rows.forEach((row, i) => {
      const line = lines[i];
      if (!line) return row.zh?.remove(), (row.zh = null);
      if (!row.zh) row.el.append((row.zh = h("div", { class: "st-zh", "data-tts-skip": "" })));
      row.zh.textContent = line;
    });
  }

  // ---------------------------------------------------------------- grammar patterns

  // Under each sentence, the patterns found in it; in the side list, each pattern once.
  function paintGrammar() {
    const g = data.grammar;
    const found = g?.found ?? [];
    rows.forEach((row) => {
      const here = found.map((f, n) => [f, n]).filter(([f]) => f.start >= row.start && f.start < row.end);
      row.gram?.remove();
      row.gram = null;
      if (!here.length) return;
      row.gram = h(
        "div",
        { class: "st-gram", "data-tts-skip": "" },
        here.map(([f, n]) => {
          const p = g.patterns[f.id] ?? {};
          return h("span", { class: "st-gp", "data-g": n }, h("b", { lang: "ja" }, p.form ?? f.id), p.meaning ? h("span", {}, p.meaning.split("；")[0]) : null);
        }),
      );
      row.jp.after(row.gram);
    });

    const ids = [...new Set(found.map((f) => f.id))];
    gramTitle.textContent = ids.length ? `Patterns (${ids.length})` : "Patterns";
    if (!ids.length) {
      const hint = !data.text ? "Patterns in the text will be listed here" : g ? "No known patterns found" : status.gram?.error ? "Patterns not found: " + status.gram.error : "Patterns in the text are listed here once the words are split";
      return gramEl.replaceChildren(h("p", { class: "st-hint" }, hint));
    }
    gramEl.replaceChildren(
      ...ids.map((id) => {
        const p = g.patterns[id] ?? {};
        return h(
          "div",
          { class: "st-gitem", "data-id": id, title: "Click for the explanation and examples" },
          h("div", { class: "st-word-head" }, h("b", { lang: "ja" }, p.form ?? id), p.level ? h("span", { class: "st-lv", "data-level": p.level.toLowerCase(), title: "Rough level, not an official item-by-item list" }, p.level) : null),
          p.meaning ? h("p", {}, p.meaning) : null,
          h("div", { class: "st-gmore" }, gramDetails(p)),
        );
      }),
    );
  }

  // The note on a pattern and its example sentence, with a button to hear the example.
  function gramDetails(p) {
    return globalThis.mojiStudyGrammar.details(p, h, (text) => tts.read(null, text));
  }

  // The words a pattern (or every place a pattern is found) is made of, lit up in the text.
  function lightGrammar(found) {
    const lit = new Set(found.flatMap((f) => f.words));
    tokenEls.forEach((el, i) => el.classList.toggle("st-lit", lit.has(i)));
  }

  gramEl.addEventListener("click", (e) => e.target.closest(".st-gitem")?.classList.toggle("is-open"));
  gramEl.addEventListener("mouseover", (e) => {
    const id = e.target.closest(".st-gitem")?.dataset.id;
    lightGrammar((data.grammar?.found ?? []).filter((f) => f.id === id));
  });
  gramEl.addEventListener("mouseleave", () => lightGrammar([]));

  // ---------------------------------------------------------------- words and their meanings

  function addWords(list) {
    let added = false;
    for (const w of list ?? []) {
      if (!w?.objectId || data.words.some((o) => o.objectId === w.objectId)) continue;
      data.words.push(w);
      added = true;
    }
    if (added) markKnownWords(), paintWords();
  }

  const wordFor = (t) => studyText.wordFor(data.words, t);

  function markKnownWords() {
    if (!data.tokens) return;
    tokenEls.forEach((el, i) => {
      const w = wordFor(data.tokens[i]);
      el.classList.toggle("st-known", !!w);
      if (w) el.dataset.word = w.objectId;
      else delete el.dataset.word;
      const lv = levelOf(w);
      if (lv) el.dataset.level = "n" + lv;
      else delete el.dataset.level;
    });
  }

  function paintWords() {
    wordsTitle.textContent = data.words.length ? `Words (${data.words.length})` : "Words";
    if (!data.words.length) {
      return wordsEl.replaceChildren(h("p", { class: "st-hint" }, data.text ? "Words and meanings are listed here once MOJi has translated or analyzed" : "Words and meanings in the text will be listed here"));
    }
    const order = (w) => data.tokens?.findIndex((t) => wordFor(t) === w) ?? 0;
    const list = [...data.words].sort((a, b) => order(a) - order(b));
    wordsEl.replaceChildren(
      ...list.map((w) => {
        const lv = levelOf(w);
        return h(
          "div",
          { class: "st-word", "data-word": w.objectId, title: "Click to read this word" },
          h(
            "div",
            { class: "st-word-head" },
            h("b", { lang: "ja" }, w.spell),
            w.pron && w.pron !== w.spell ? h("span", { class: "st-pron", lang: "ja" }, w.pron) : null,
            w.accent ? h("span", { class: "st-acc" }, w.accent) : null,
            lv ? h("span", { class: "st-lv", "data-level": "n" + lv }, "N" + lv) : null,
            h("a", { class: "st-look", href: `/details/${w.objectId}`, target: "_blank", title: "Open this word in MOJi" }, "Look up"),
          ),
          w.excerpt ? h("p", {}, w.excerpt) : null,
        );
      }),
    );
  }

  wordsEl.addEventListener("click", (e) => {
    if (e.target.closest("a")) return;
    const item = e.target.closest(".st-word");
    const w = item && data.words.find((o) => o.objectId === item.dataset.word);
    if (w) tts.read(null, w.spell);
  });
  // Pointing at a word in the list lights it up in the text.
  wordsEl.addEventListener("mouseover", (e) => {
    const id = e.target.closest(".st-word")?.dataset.word;
    for (const el of tokenEls) el.classList.toggle("st-lit", !!id && el.dataset.word === id);
  });
  wordsEl.addEventListener("mouseleave", () => tokenEls.forEach((el) => el.classList.remove("st-lit")));

  // ---------------------------------------------------------------- the word card

  // (study-card.js)
  const card = globalThis.mojiStudyCard({ h, pop, page, data: () => data, wordFor, levelOf, gramDetails, readFrom, tts });

  rowsEl.addEventListener("mouseover", (e) => {
    const el = e.target.closest(".st-w, .st-gp");
    const gp = e.target.closest(".st-gp");
    lightGrammar(gp ? [data.grammar?.found[+gp.dataset.g]].filter(Boolean) : []);
    // The phrase this one leads to, from MOJi's analysis.
    const phrase = e.target.closest(".st-phrase");
    rowsEl.querySelectorAll(".is-from, .is-to").forEach((p) => p.classList.remove("is-from", "is-to"));
    if (phrase?.dataset.to) {
      phrase.classList.add("is-from");
      phraseEls.get(+phrase.dataset.to)?.classList.add("is-to");
    }
    card.point(el);
  });
  rowsEl.addEventListener("mouseleave", () => {
    lightGrammar([]);
    rowsEl.querySelectorAll(".is-from, .is-to").forEach((p) => p.classList.remove("is-from", "is-to"));
    card.leave();
  });
  // ---------------------------------------------------------------- reading

  // From the clicked word to the end of the text (or of its sentence, if the popup's
  // "read to the end" setting is off).
  function readFrom(el) {
    const root = readToEnd ? rowsEl : el.closest(".st-row");
    const src = tts.collect(root);
    const first = src.nodes.find((n) => el.contains(n.node));
    if (!first) return;
    card.hide();
    tts.read({ ...src, from: first.start });
    tts.sayStart({ ...src, from: first.start });
  }

  function readAll() {
    const src = tts.collect(rowsEl);
    if (src.text.trim()) tts.read({ ...src, from: 0 });
  }

  rowsEl.addEventListener("click", (e) => {
    const el = e.target.closest(".st-w");
    if (!el || !getSelection().isCollapsed) return; // dragging to select text
    readFrom(el);
  });

  // ---------------------------------------------------------------- the text box

  function fit() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, innerHeight * 0.4) + "px";
    count.textContent = `${input.value.length}/${MAX}`;
    tts.relayout();
  }
  input.addEventListener("input", fit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) e.preventDefault(), run();
  });
  goButton.addEventListener("click", run);
  clearButton.addEventListener("click", () => {
    input.value = "";
    fit();
    input.focus();
  });
  serviceSelect.addEventListener("change", () => {
    setPref("translate", serviceSelect.value);
    // Google and Bing cost nothing, so the text on show is translated again right away.
    if (["google", "bing"].includes(prefs.translate) && data.tokens && !status.trans?.busy) startTranslation();
  });

  // ---------------------------------------------------------------- settings and saving

  function setPref(name, value) {
    prefs[name] = value;
    chrome.storage.sync.set({ studyPrefs: prefs });
    paintPrefs();
    if (["pos", "verb", "lemma"].includes(name)) paintNotes();
  }

  function paintPrefs() {
    rowsEl.dataset.kana = prefs.kana;
    rowsEl.dataset.trans = prefs.trans;
    rowsEl.dataset.main = prefs.main;
    rowsEl.dataset.pos = prefs.pos;
    rowsEl.dataset.gram = prefs.gram;
    viewPanel.dataset.pos = prefs.pos;
    serviceSelect.value = prefs.translate;
    for (const s of page.querySelectorAll(".st-seg")) {
      for (const b of s.children) b.classList.toggle("is-on", prefs[s.dataset.pref] === b.dataset.value);
    }
  }

  // The last text and everything found about it, so it is all still there next time.
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const { text, tokens, sentences, transDone, transBy, words, phrases, grammar } = data;
      chrome.storage.local.set({ study: { text, tokens, sentences: transDone ? sentences : null, transDone, transBy: transDone ? transBy : null, words, phrases, grammar } });
    }, 500);
  }

  function restore(saved) {
    if (!saved?.text) return paint();
    data = { ...blank(saved.text), ...saved };
    if (data.transDone && !data.transBy) data.transBy = "moji"; // saved before there was a choice
    input.value = saved.text;
    fit();
    tokenEls = [];
    paint();
    // Saved before there were grammar patterns; only for words from the local server (with
    // dictionary forms), since the patterns point at its words by number.
    if (!data.grammar && data.tokens?.some((t) => t.lemma)) findGrammar(data.text);
  }

  function paint() {
    if (data.tokens) layoutRows();
    else rowsEl.replaceChildren(h("div", { class: "st-empty" }, "Type Japanese above, then click \"Translate and analyze\""));
    paintWords();
    if (!data.tokens) paintGrammar();
  }

  chrome.storage.sync.get({ readToEnd, autoRead, studyPrefs: prefs }).then((v) => {
    readToEnd = v.readToEnd;
    autoRead = v.autoRead;
    prefs = { ...prefs, ...v.studyPrefs };
    // Before there was a choice, this was just on (MOJi) or off.
    if (typeof prefs.translate === "boolean") prefs.translate = prefs.translate ? "moji" : "off";
    if (!(prefs.translate in SERVICES) && prefs.translate !== "off") prefs.translate = "google";
    paintPrefs();
    paintNotes();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (gone || area !== "sync") return;
    if (changes.readToEnd) readToEnd = changes.readToEnd.newValue;
    if (changes.autoRead) autoRead = changes.autoRead.newValue;
  });
  chrome.storage.local.get("study").then((v) => restore(v.study));

  // ---------------------------------------------------------------- start and stop

  const observer = new MutationObserver(() => {
    if (!menuQueued) (menuQueued = true), requestAnimationFrame(() => ((menuQueued = false), gone || (placeMenuItem(), isOpen() && markMenu())));
  });
  let menuQueued = false;
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // A newer copy of the extension's scripts replaces this one (see content.js).
  let gone = false;
  document.addEventListener(
    "moji-tts-replace",
    () => {
      // The newer copy opens its own page again if ours was open (the address still says so).
      const hash = location.hash;
      close(); // gives MOJi's own menu item back its highlight
      if (hash === HASH) history.replaceState(history.state, "", location.pathname + location.search + HASH);
      gone = true;
      observer.disconnect();
      menuSize.disconnect();
      for (const f of Object.values(frames)) f.el.remove();
      for (const el of [page, sheet, menuItem]) el?.remove();
    },
    { once: true },
  );

  fit();
  paintPrefs();
  document.documentElement.append(sheet, page);
  placeMenuItem();
  // MOJi's own page code sometimes takes the #tts-study off the address before this script
  // runs, so the address the page was first opened with is checked too. Only the first
  // time: a newer copy of this script (after an update) goes by the address as it is now.
  // A refresh while our page was open opens it again.
  const first = globalThis.mojiTtsStudyRan ? null : performance.getEntriesByType("navigation")[0];
  globalThis.mojiTtsStudyRan = true;
  const refreshed = first?.type === "reload" && sessionStorage.getItem(OPEN_KEY) === "1";
  if (location.hash === HASH || first?.name.endsWith(HASH) || refreshed) open();
  else sessionStorage.removeItem(OPEN_KEY); // left over from before going to another address
})();
