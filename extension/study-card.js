// The card that comes up when the mouse rests on a word (or a grammar pattern) of the study
// page (study.js): reading, dictionary form, word class, what hangs on the word, meaning,
// and buttons to read it. study.js makes it with makeCard(ctx), where ctx gives what the
// card needs from the page:
//   h, pop (the card element), page, data() (what is known about the text), wordFor,
//   levelOf, gramDetails (the note and example of a pattern), readFrom(el), tts.
// Gives back { point(el), leave(), hide() }.
(() => {
  const { POS, PARTICLE, FORM, verbType, chain: chainOf } = globalThis.mojiGrammar;

  globalThis.mojiStudyCard = function makeCard({ h, pop, page, data, wordFor, levelOf, gramDetails, readFrom, tts }) {
    const CIRCLED = "⓪①②③④⑤⑥⑦⑧⑨";

    let popTimer = null;
    let popFor = null;

    function showPop(el) {
      if (el.classList.contains("st-gp")) return showGramPop(el);
      pop.classList.remove("st-grammar-pop");
      const t = data().tokens?.[+el.dataset.i];
      if (!t || el.classList.contains("st-punct")) return;
      const w = wordFor(t);
      const base = t.base && t.base !== t.surface ? t.base : "";
      const reading = t.kana && t.kana !== t.surface ? t.kana : "";
      const kind = [
        t.pos[0] === "助詞" ? PARTICLE[t.pos[1]] ?? "Particle" : POS[t.pos[0]] ?? t.pos[0],
        verbType(t.cType),
        t.cForm && base ? "Here: " + (FORM[t.cForm.split("-")[0]] ?? t.cForm.split("-")[0]) : "",
      ].filter(Boolean);
      const accent = w?.accent || (t.accent && /^\d$/.test(t.accent) ? CIRCLED[+t.accent] : "");
      const lv = levelOf(w);
      // The word with what hangs on it (grammar.js): 作ら → れ passive → て → い → ます.
      const chain = chainOf(data().tokens, +el.dataset.i);
      const here = +el.dataset.i;
      // (replaceChildren would show a left-out line as the word "null")
      pop.replaceChildren(
        ...[
          h(
            "div",
            { class: "st-pop-head", lang: "ja" },
            h("b", {}, t.surface),
            reading ? h("span", { class: "st-pron" }, reading) : null,
            accent ? h("span", { class: "st-acc" }, accent) : null,
            lv ? h("span", { class: "st-lv", "data-level": "n" + lv }, "N" + lv) : null,
          ),
          base ? h("div", { class: "st-pop-base" }, "Base form ", h("b", { lang: "ja" }, base), t.baseKana && t.baseKana !== base ? h("span", { class: "st-pron", lang: "ja" }, t.baseKana) : null) : null,
          kind.length ? h("div", { class: "st-pop-kind" }, kind.join(" · ")) : null,
          chain
            ? h(
                "div",
                { class: "st-pop-chain" },
                chain.flatMap((p, k) => [
                  k ? h("span", { class: "st-arrow" }, "→") : null,
                  h(
                    "span",
                    { class: "st-piece" + (p.i === here ? " is-here" : "") },
                    // A helper verb in a changed form shows its dictionary form too: い（いる）.
                    h("b", { lang: "ja" }, p.surface, k && p.base !== p.surface && ["動詞", "形容詞"].includes(data().tokens[p.i].pos[0]) ? h("span", { class: "st-piece-base" }, `(${p.base})`) : null),
                    h("small", { lang: k ? "en" : "ja" }, k ? p.meaning || (p.base !== p.surface ? p.base : "") : p.base),
                  ),
                ]),
              )
            : null,
          w?.excerpt ? h("div", { class: "st-pop-mean" }, w.excerpt) : null,
          h(
            "div",
            { class: "st-pop-actions" },
            h("button", { type: "button", onclick: () => tts.read(null, base || t.surface) }, base ? "Read base form" : "Read this word"),
            h("button", { type: "button", onclick: () => readFrom(el) }, "Read from here"),
            w ? h("a", { href: `/details/${w.objectId}`, target: "_blank" }, "Look up in MOJi") : null,
          ),
        ].filter(Boolean),
      );
      placePop(el);
    }

    function showGramPop(el) {
      const f = data().grammar?.found[+el.dataset.g];
      const p = f && data().grammar.patterns[f.id];
      if (!p) return;
      pop.classList.add("st-grammar-pop");
      pop.replaceChildren(
        ...[
          h("div", { class: "st-pop-head" }, h("b", { lang: "ja" }, p.form), p.level ? h("span", { class: "st-lv", "data-level": p.level.toLowerCase(), title: "Rough level, not an official item-by-item list" }, p.level) : null),
          p.meaning ? h("div", { class: "st-pop-kind" }, p.meaning) : null,
          h("div", { class: "st-pop-mean" }, gramDetails(p)),
        ].filter(Boolean),
      );
      placePop(el);
    }

    function placePop(el) {
      pop.style.display = "block";
      const r = el.getBoundingClientRect();
      const pr = pop.getBoundingClientRect();
      // Inside our page: MOJi's left menu lies on top of anything to the left of it.
      const area = page.getBoundingClientRect();
      const left = Math.max(area.left + 8, Math.min(r.left + r.width / 2 - pr.width / 2, area.right - pr.width - 8));
      const below = r.bottom + 8 + pr.height < innerHeight;
      pop.style.left = left + "px";
      pop.style.top = (below ? r.bottom + 8 : Math.max(8, r.top - pr.height - 8)) + "px";
      popFor = el;
    }

    function hidePop() {
      clearTimeout(popTimer);
      pop.style.display = "none";
      popFor = null;
    }

    // The mouse is now on `el` (a word or pattern, or null for neither): show its card after
    // a moment, quicker if a card is already up; or hide the card after a moment.
    function point(el) {
      if (el === popFor) return clearTimeout(popTimer);
      clearTimeout(popTimer);
      if (el) popTimer = setTimeout(() => showPop(el), popFor ? 80 : 350);
      else if (popFor) popTimer = setTimeout(hidePop, 250);
    }

    function leave() {
      clearTimeout(popTimer);
      if (popFor) popTimer = setTimeout(hidePop, 250);
    }

    pop.addEventListener("mouseenter", () => clearTimeout(popTimer));
    pop.addEventListener("mouseleave", () => (popTimer = setTimeout(hidePop, 250)));
    page.addEventListener("scroll", hidePop, true);

    return { point, leave, hide: hidePop };
  };
})();
