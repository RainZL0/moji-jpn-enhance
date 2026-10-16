// Work on the text for the study page (study.js) that needs no page, so it can be tested
// with node on its own (see tests/extension/), like grammar.js:
//   - rough words when the local server is not there,
//   - MOJi's readings put on our words,
//   - where each phrase starts, and the sentence core,
//   - which translation line goes under which sentence,
//   - which of MOJi's dictionary words a word is, and its JLPT level.
(() => {
  // MOJi may tidy up spaces and line breaks, so texts are compared without them.
  const sameText = (a, b) => a.replace(/\s/g, "") === b.replace(/\s/g, "");

  // Without the local server: words cut by the browser, with no readings.
  function roughTokens(text) {
    const out = [];
    for (const s of new Intl.Segmenter("ja", { granularity: "word" }).segment(text)) {
      if (/^\s+$/.test(s.segment)) continue;
      out.push({ start: s.index, end: s.index + s.segment.length, surface: s.segment, kana: "", ruby: [], pos: s.isWordLike ? [] : ["補助記号"], cType: "", cForm: "", base: "", lemma: "", baseKana: "", accent: "" });
    }
    return out;
  }

  // ---------------------------------------------------------------- readings

  const HAN = /[\p{Script=Han}々〆ヵヶ]/u;
  const hira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

  // Readings for just the kanji of a word: 食べ + たべ -> た over 食.
  function splitRuby(surface, kana, start) {
    const runs = surface.match(/[\p{Script=Han}々〆ヵヶ]+|[^\p{Script=Han}々〆ヵヶ]+/gu);
    const pattern = runs.map((r) => (HAN.test(r) ? "(.+?)" : hira(r).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("");
    const m = new RegExp("^" + pattern + "$", "u").exec(kana);
    if (!m) return [[start, start + surface.length, kana]];
    const out = [];
    let at = start;
    let g = 1;
    for (const r of runs) {
      if (HAN.test(r)) out.push([at, at + r.length, m[g++]]);
      at += r.length;
    }
    return out;
  }

  // MOJi's analysis also gives a reading for each word, and it is usually the better one
  // (the local dictionary reads 米 as べい, for example), so it replaces ours. Changes the
  // words in `tokens` and gives back the numbers of the ones changed.
  function useMojiReadings(tokens, text, phrases) {
    const changed = [];
    const byStart = new Map(tokens.map((t, i) => [t.start, i]));
    let cursor = 0;
    for (const node of phrases.flat(2).flatMap((chunk) => chunk.childNodes ?? [])) {
      const surface = node.surface_form ?? "";
      const at = surface ? text.indexOf(surface, cursor) : -1;
      if (at < 0) continue;
      cursor = at + surface.length;
      const i = byStart.get(at);
      const t = tokens[i];
      const kana = hira(node.reading ?? "");
      if (!t || t.surface !== surface || !HAN.test(surface) || !kana || kana === t.kana || /[^ぁ-ゖー]/.test(kana)) continue;
      t.kana = kana;
      t.ruby = splitRuby(surface, kana, at);
      changed.push(i);
    }
    return changed;
  }

  // ---------------------------------------------------------------- phrases

  const OPENING = /^[「『（(【〔［\[〈《“‘]+$/;
  const CLOSING = /^[」』）)】〕］\]〉》”’"]+$/;
  const INDEPENDENT = new Set(["名詞", "代名詞", "動詞", "形容詞", "形状詞", "副詞", "連体詞", "接続詞", "感動詞", "接頭辞"]);

  // Where each phrase starts, and which phrase it leads to (MOJi's analysis), or where a
  // phrase probably starts (a simple rule on the word types) until that is in.
  // Gives { starts: start offset -> start offset of the phrase it leads to, or -1,
  //         core: the start offsets of the phrases of the sentence cores }.
  function phraseStarts(tokens, text, phrases) {
    const starts = new Map();
    const core = new Set();
    if (phrases) {
      let cursor = 0;
      for (const sentence of phrases) {
        const found = [];
        for (const chunk of sentence.flat()) {
          // MOJi sends line breaks as "↴".
          const surface = (chunk.childNodes ?? []).map((n) => n.surface_form).join("").replace(/↴/g, "");
          const at = text.indexOf(surface.trim(), cursor);
          if (!surface.trim() || at < 0) continue;
          cursor = at + surface.trim().length;
          found.push({ at, id: chunk.attributes?.id, link: chunk.attributes?.link });
        }
        for (const c of found) starts.set(c.at, found.find((o) => o.id === c.link)?.at ?? -1);
        // The sentence core, as MOJi marks it: the phrase the sentence ends on (it leads
        // nowhere) and the phrases leading straight to it.
        const end = found.find((c) => String(c.link) === "-1");
        for (const c of found) if (end && (c === end || c.link === end.id)) core.add(c.at);
      }
      if (starts.size) return { starts, core };
    }
    let prev = null;
    for (const t of tokens) {
      const [p1, p2] = t.pos;
      const attach =
        !prev ||
        !INDEPENDENT.has(p1) ||
        (p1 === "名詞" && prev.pos[0] === "名詞") || // 日本 + 語
        prev.pos[0] === "接頭辞" ||
        OPENING.test(prev.surface) || // 「 + 本当
        (p2 === "非自立可能" && p1 === "動詞" && (prev.pos[1] === "接続助詞" || prev.pos[0] === "動詞")); // 〜ている
      if (!attach || !prev || /括弧開/.test(t.pos[1] ?? "")) starts.set(t.start, -1);
      prev = t;
    }
    return { starts, core };
  }

  // ---------------------------------------------------------------- translation

  // The translated sentences matched to our rows ({ start, end }) by where their text
  // starts. Gives one line of translation per row ("" for none).
  function translationLines(sentences, text, rows) {
    const lines = rows.map(() => []);
    let cursor = 0;
    let last = -1;
    for (const { src, dst } of sentences ?? []) {
      const s = (src ?? "").trim();
      let at = s ? text.indexOf(s, cursor) : -1;
      if (at < 0 && s.length > 6) at = text.indexOf(s.slice(0, 6), cursor);
      let r;
      if (at >= 0) {
        cursor = at + s.length;
        r = rows.findIndex((row) => at < row.end);
        if (r < 0) r = rows.length - 1;
      } else r = Math.min(last + 1, rows.length - 1);
      last = Math.max(last, r);
      if (dst?.trim()) lines[r].push(dst.trim());
    }
    return lines.map((l) => l.join(" "));
  }

  // ---------------------------------------------------------------- MOJi's words

  const keysOf = (t) => [t.base, t.lemma, t.surface].filter(Boolean);
  function wordFor(words, t) {
    const keys = keysOf(t);
    return words.find((w) => keys.includes(w.spell)) ?? words.find((w) => t.baseKana && w.pron === t.baseKana && keys.some((k) => k === w.pron));
  }

  const LEVEL = /n([1-5])/i;
  function levelOf(w) {
    const n = (w?.level ?? []).map((l) => +(LEVEL.exec(l)?.[1] ?? 0)).filter(Boolean);
    return n.length ? Math.max(...n) : 0; // the easiest level it is listed at
  }

  const api = { sameText, roughTokens, hira, splitRuby, useMojiReadings, OPENING, CLOSING, phraseStarts, translationLines, wordFor, levelOf };
  if (typeof module === "object") module.exports = api;
  else globalThis.mojiStudyText = api;
})();
