// Runs inside the two hidden MOJi pages (/trans and /ana) that the study page keeps in the
// background (see study.js). It fills in the text, presses MOJi's own button, and passes
// MOJi's answer back. The answer is read from MOJi's own requests as they come back,
// because the page itself shows the translation one character at a time, which is slow.
(() => {
  if (window.__mojiTtsFrame) return;
  window.__mojiTtsFrame = true;

  const post = (msg) => parent.postMessage({ mojiTtsFrame: true, ...msg }, location.origin);
  const page = location.pathname.startsWith("/ana") ? "ana" : "trans";
  let asked = ""; // the text we were last asked about

  // ---------------------------------------------------------------- MOJi's answers

  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__mojiTtsUrl = String(url);
    return open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    const url = this.__mojiTtsUrl || "";
    this.addEventListener("loadend", () => {
      let data = null;
      try {
        data = JSON.parse(this.responseText);
      } catch {}
      const failed = this.status !== 200 || !data;
      // Translation: MOJi first asks for a task (this is where AI points are checked); the
      // answer lists the sentences the text was cut into ...
      if (/\/ai-points\/business\/trans\/task/.test(url)) {
        if (failed || !data.taskId) post({ kind: "error", text: asked, message: data?.message || data?.error || "MOJi did not accept the translation request" });
        else sources = data.textStringList || [];
      }
      // ... (the translation itself comes in bit by bit, see "fetch" below) and once it is
      // done, fetches it again together with the words of the text and their meanings.
      else if (/\/trans\/[^/]+\/mecab/.test(url)) {
        if (failed) post({ kind: "error", text: asked, message: "Could not get the translation result from MOJi" });
        else post({ kind: "translation", text: asked, sentences: data.trans_dst || [], words: data.levelWords || [] });
      }
      // Analysis: the text cut into phrases (with which phrase each one leads to) ...
      else if (/nlt-grammarizeText/.test(url)) {
        let sentences = null;
        try {
          sentences = JSON.parse(data.result.result);
        } catch {}
        if (sentences) post({ kind: "phrases", text: asked, sentences });
        else post({ kind: "error", text: asked, message: "Could not get the analysis result from MOJi" });
      }
      // ... and the words of the text with their meanings.
      else if (/nlt-tokenizeText-forTrans/.test(url) && !failed) {
        post({ kind: "words", text: asked, words: data.result?.levelWords || [] });
      }
    });
    return send.apply(this, arguments);
  };

  // The translation arrives as a stream of small pieces, each for one of the sentences.
  let sources = [];
  const fetchOriginal = window.fetch;
  window.fetch = async function (input) {
    const res = await fetchOriginal.apply(this, arguments);
    const url = String(input?.url ?? input);
    if (/\/ai-points\/business\/trans\/[^/]+\/stream/.test(url) && res.body) readStream(res.clone(), asked);
    return res;
  };

  async function readStream(res, text) {
    const parts = [];
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let rest = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        rest += value;
        const lines = rest.split("\n");
        rest = lines.pop();
        let changed = false;
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          try {
            const { index, content } = JSON.parse(line.slice(5));
            if (index >= 1) (parts[index - 1] = (parts[index - 1] ?? "") + content), (changed = true);
          } catch {} // "data:end" and the like
        }
        if (changed) post({ kind: "partial", text, sentences: sources.map((src, i) => ({ src, dst: parts[i] ?? "" })) });
      }
      // All in. (MOJi's page fetches it once more with the words and their meanings, but
      // only after showing it letter by letter, which a hidden page may never finish.)
      if (parts.length) post({ kind: "translation", text, sentences: sources.map((src, i) => ({ src, dst: parts[i] ?? "" })), words: [] });
    } catch {}
  }

  // MOJi's own pop-up messages (such as "not enough points") are passed on as they are.
  new MutationObserver(() => {
    for (const m of document.querySelectorAll(".el-message:not([data-moji-tts-seen])")) {
      m.dataset.mojiTtsSeen = "1";
      const message = m.textContent.trim();
      if (message) post({ kind: "notice", text: asked, message });
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  // ---------------------------------------------------------------- doing what we are asked

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(find, ms = 10000) {
    for (let t = 0; t < ms; t += 100) {
      const el = find();
      if (el) return el;
      await sleep(100);
    }
    return null;
  }

  async function translate(text) {
    // Japanese to Chinese: MOJi remembers the last direction, so swap it if needed.
    const from = await waitFor(() => document.querySelector(".trans-mode .trans-word"));
    if (!from) return post({ kind: "error", text, message: "The MOJi translation page did not open" });
    // Still bringing in the last translation: MOJi would ignore new text until it is done.
    await waitFor(() => !document.querySelector(".main-body .stream-interaction-mask")?.checkVisibility(), 30000);
// "日语" is MOJi's own Chinese label for Japanese on its page; it must stay as is.
    if (from.textContent.trim() !== "日语") {
      document.querySelector(".trans-mode .btn-swap-mode")?.click();
      await sleep(300);
    }
    // MOJi's text box follows changes made straight to it.
    const editor = document.querySelector(".trans-input .ql-editor");
    editor.replaceChildren(
      ...text.split("\n").map((line) => {
        const p = document.createElement("p");
        if (line) p.textContent = line;
        else p.append(document.createElement("br"));
        return p;
      }),
    );
    const button = await waitFor(() => document.querySelector(".toolbar-right .moji-btn.primary:not(.disabled)"), 2000);
    if (button) button.click();
    // Greyed out: the same text was already translated, and its answer was already sent.
    else post({ kind: "same", text });
  }

  // Whether one of MOJi's dialogs is open. A page kept out of sight may not play animations,
  // so a closed dialog can stay on screen, stuck in its closing animation; MOJi's own
  // record of it (in Vue, the framework MOJi's pages are built with) is what counts.
  function isOpen(dialog) {
    const vm = dialog.parentElement?.__vue__?.$parent;
    if (vm && typeof vm.visible === "boolean") return vm.visible;
    return dialog.checkVisibility() && !/leave/.test(dialog.parentElement?.className ?? "");
  }
  const openDialog = (sel) => [...document.querySelectorAll(sel)].find(isOpen);

  // MOJi's membership panel. Pressed before MOJi has loaded the account, 輸入文本 shows this
  // instead of the text box.
  function closeMemberPanel() {
    const panel = openDialog(".el-dialog.dialog-pro");
    panel?.querySelector(".el-dialog__headerbtn")?.click();
    return !!panel;
  }

  async function analyse(text) {
    const openButton = await waitFor(() => document.querySelector(".toolbar .buttons .el-button--primary"));
    if (!openButton) return post({ kind: "error", text, message: "The MOJi analysis page did not open" });
    let dialog = null;
    for (let tries = 0; tries < 4 && !dialog; tries++) {
      if (closeMemberPanel()) await sleep(500);
      openButton.click();
      dialog = await waitFor(() => openDialog(".el-dialog:not(.dialog-pro)")?.querySelector("textarea")?.closest(".el-dialog") || (openDialog(".el-dialog.dialog-pro") && "panel"), 5000);
      if (dialog === "panel") (dialog = null), await sleep(1000);
    }
    closeMemberPanel();
    const box = dialog?.querySelector("textarea");
    if (!box) return post({ kind: "error", text, message: "The input box on the MOJi analysis page did not appear. Please make sure you are logged in to MOJi" });
    // Set the value the way typing would, so MOJi's page notices it.
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(box, text);
    box.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(100);
    const go = dialog.querySelector(".moji-btn.btn-confirm");
    if (!go) return post({ kind: "error", text, message: "The analyze button on the MOJi analysis page did not appear" });
    go.click();
  }

  addEventListener("message", (e) => {
    if (e.source !== parent || e.origin !== location.origin || !e.data?.mojiTtsStudy) return;
    asked = e.data.text;
    if (page === "trans") translate(asked);
    else analyse(asked);
  });

  post({ kind: "ready" });
})();
