// Grammar teaching details shared by the side list and hover card. The caller supplies
// its element builder and audio action, so this view can also be tested without MOJi.
(() => {
  function details(p, h, read) {
    const explanation = (label, text, extra = "") => text ? h("p", { class: "st-gnote" + extra }, label ? h("b", {}, label + ": ") : null, text) : null;
    return [
      explanation("Connection", p.connection),
      explanation("", p.note),
      explanation("Contrast", p.contrast),
      explanation("Recognition hint", p.recognitionNote, " st-glimit"),
      p.example
        ? h(
            "div",
            { class: "st-gex" },
            h("span", { lang: "ja" }, p.example),
            h("button", { type: "button", class: "st-gread", title: "Read the example", onclick: (e) => (e.stopPropagation(), read(p.example)) }, "▶"),
            p.translation ? h("div", { class: "st-gtrans" }, p.translation) : null,
          )
        : null,
    ].filter(Boolean);
  }

  const api = { details };
  if (typeof module === "object") module.exports = api;
  else globalThis.mojiStudyGrammar = api;
})();
