// Japanese grammar knowledge for the study page (study.js), with no page code in it, so it
// can be tested with node on its own (see tests/extension/).
// Works on the words the local server gives (/api/analyze), which carry each word's word
// class, dictionary form and conjugation, with UniDic's own Japanese labels (名詞, 五段-カ行 ...).
//   - English names for those labels, shown under the words and on the word card.
//   - chain(): what is attached to a word, piece by piece, for the word card:
// 作られています is 作る, then れ (passive), て (joins), い (いる: going on), ます (polite).
(() => {
  // ---------------------------------------------------------------- names for the labels

  // Word class, in full (word card) and short (under the words).
  const POS = {
名詞: "Noun", 代名詞: "Pronoun", 動詞: "Verb", 形容詞: "I-adjective", 形状詞: "Na-adjective", 副詞: "Adverb",
連体詞: "Adnominal", 接続詞: "Conjunction", 感動詞: "Interjection", 助詞: "Particle", 助動詞: "Auxiliary verb",
接頭辞: "Prefix", 接尾辞: "Suffix", 補助記号: "Punctuation", 記号: "Symbol",
  };
  const POS_SHORT = {
名詞: "n", 代名詞: "pron", 動詞: "v", 形容詞: "adj", 形状詞: "na-adj", 副詞: "adv", 連体詞: "adn", 接続詞: "conj",
感動詞: "int", 助詞: "prt", 助動詞: "aux", 接頭辞: "pre", 接尾辞: "suf",
  };
  const PARTICLE = { 格助詞: "Case particle", 係助詞: "Topic particle", 副助詞: "Adverbial particle", 接続助詞: "Conjunctive particle", 終助詞: "Sentence-ending particle", 準体助詞: "Nominalizing particle" };
  const FORM = { 未然形: "negative base", 連用形: "connecting base", 終止形: "dictionary form", 連体形: "noun-modifying form", 仮定形: "conditional base", 命令形: "command form", 意志推量形: "volitional form", 語幹: "stem" };

  // The word classes shown in colour, as on MOJi's analysis page.
  function wordClass(t) {
    return { 名詞: "noun", 代名詞: "noun", 動詞: "verb", 形容詞: "adj", 形状詞: "adj", 副詞: "adv", 助詞: "particle", 助動詞: "aux" }[t.pos[0]] ?? "";
  }

// 五段 / 一段 / サ変 / カ変 (Godan / Ichidan / Suru / Kuru), or with naming "class" the same as Group 1 / 2 / 3.
  function verbGroup(t, naming) {
    if (t.pos[0] !== "動詞" || !t.cType) return "";
    const g = t.cType.startsWith("五段") ? 0 : /^[上下]一段/.test(t.cType) ? 1 : t.cType.startsWith("サ行変格") ? 2 : t.cType.startsWith("カ行変格") ? 3 : -1;
    if (g < 0) return "";
    return (naming === "class" ? ["Group 1", "Group 2", "Group 3", "Group 3"] : ["Godan", "Ichidan", "Suru", "Kuru"])[g];
  }

  // The verb type in full, for the word card: Godan verb (カ行).
  function verbType(cType) {
    if (!cType) return "";
    if (cType.startsWith("五段")) return `Godan verb (${cType.split("-")[1] ?? ""})`;
    if (/^[上下]一段/.test(cType)) return "Ichidan verb";
    if (cType.startsWith("サ行変格")) return "Suru verb";
    if (cType.startsWith("カ行変格")) return "Kuru verb";
    return "";
  }

  // ---------------------------------------------------------------- what hangs on a word

  // Helper words that only add meaning to the word before them, by their dictionary form.
  const AUX = {
れる: "passive / respect",
られる: "passive / can / respect",
せる: "causative (make, let)",
させる: "causative (make, let)",
ない: "not",
ぬ: "not (written style)",
ん: "not",
た: "past or done",
だ: "is (plain)",
です: "is (polite)",
ます: "polite",
たい: "want to",
らしい: "seems, I hear",
まい: "will not, probably not",
う: "let's... (intent / guess)",
よう: "let's... (intent / guess)",
べし: "should",
ようだ: "seems",
みたい: "seems",
ごとし: "like",
  };
  // Verbs and adjectives that follow て and add meaning, by their dictionary form as UniDic
  // writes it (居る for いる, 仕舞う for しまう).
  const AFTER_TE = {
居る: "is doing... / state goes on",
有る: "is left... (state)",
仕舞う: "...all done / regret",
置く: "do ahead of time",
見る: "try doing...",
来る: "...and come / start to...",
行く: "...and go / keep on...",
上げる: "do for someone",
遣る: "do for someone",
呉れる: "someone does for me",
貰う: "have someone do",
下さる: "please do... (honorific)",
頂く: "have someone do (humble)",
見せる: "do to show someone",
欲しい: "want someone to...",
  };
  const JOINS = { て: "joins", ば: "if", ながら: "while...", つつ: "while..." };

  const isHelperVerb = (t) => ["動詞", "形容詞"].includes(t.pos[0]) && t.pos[1] === "非自立可能";
  const afterTe = (prev) => prev?.pos[1] === "接続助詞" && prev.lemma === "て";

  // Whether word t hangs on the word before it (prev).
  function attaches(t, prev) {
    if (!prev || !t.pos?.length) return false;
    if (t.pos[0] === "助動詞") return true;
    if (t.pos[1] === "助動詞語幹") return true; // the そう of 降りそう, the よう of …ようだ
    if (t.pos[0] === "助詞" && t.pos[1] === "接続助詞") return t.lemma in JOINS && ["動詞", "形容詞", "助動詞"].includes(prev.pos[0]);
    if (t.pos[0] === "助詞" && t.lemma === "たり") return ["動詞", "形容詞", "助動詞"].includes(prev.pos[0]);
    if (!isHelperVerb(t)) return false;
    if (afterTe(prev)) return t.lemma in AFTER_TE;
    if (t.lemma === "無い") return /^連用形/.test(prev.cForm ?? ""); // 寒くない, 行きたくない
    if (t.lemma === "為さる") return prev.pos[0] === "動詞"; // 勉強しなさい
    if (t.lemma === "為る") return prev.pos[2] === "サ変可能"; // 勉強する
    return false;
  }

  // The dictionary form of the verb a form of れる/られる follows decides what it can mean:
  // 五段 verbs say "can" with a form of their own (読める), so 読まれる is not "can read".
  function passive(head, t) {
    if (t.base === "れる" && /^(五段|サ行変格)/.test(head.cType ?? "")) return AUX.れる;
    return AUX.られる;
  }

  // What one piece means, with a note on its form where the form changes the meaning.
  function meaning(t, prev, head) {
    const form = (t.cForm ?? "").split("-")[0];
    const base = t.base || t.lemma;
    if (t.pos[0] === "助動詞") {
      if ((base === "だ" || base === "です") && form === "意志推量形") return "probably (guess)";
      if (base === "ます" && form === "意志推量形") return "polite, let's...";
      if (base === "た" && form === "仮定形") return "if... / after...";
      if (base === "だ" && form === "連体形") return "before a noun";
      if (base === "だ" && t.cForm === "連用形-ニ") return "as an adverb (...ly)";
      if (base === "れる" || base === "られる") return passive(head, t);
      return AUX[base] ?? AUX[t.lemma] ?? "";
    }
    if (t.pos[1] === "助動詞語幹") {
      if (t.lemma === "そう") return t.pos[0] === "名詞" ? "I hear" : "looks like...";
      if (t.lemma === "よう" || t.lemma === "みたい") return "好像";
      return "";
    }
    if (t.pos[0] === "助詞") return t.lemma === "たり" ? "doing things like..." : JOINS[t.lemma] ?? "";
    let m = afterTe(prev) ? AFTER_TE[t.lemma] ?? "" : t.lemma === "無い" ? "not" : t.lemma === "為さる" ? "command (do...)" : t.lemma === "為る" ? "do" : "";
    if (form === "意志推量形") m += ", let's...";
    else if (form === "命令形" && !["為さる", "下さる"].includes(t.lemma)) m += " (command)";
    return m;
  }

  const HEADS = new Set(["動詞", "形容詞", "形状詞", "名詞", "代名詞"]);

  // The word at index i together with what hangs on it, or null when nothing does.
  // Each piece: { i, surface, base, meaning }; the first piece is the word itself.
  function chain(tokens, i) {
    let start = i;
    while (start > 0 && attaches(tokens[start], tokens[start - 1])) start--;
    const head = tokens[start];
    if (!head || !HEADS.has(head.pos?.[0])) return null;
    let end = start + 1;
    while (end < tokens.length && attaches(tokens[end], tokens[end - 1])) end++;
    if (end - start < 2) return null;
    return tokens.slice(start, end).map((t, k) => ({
      i: start + k,
      surface: t.surface,
      base: t.base || t.lemma,
      meaning: k ? meaning(t, tokens[start + k - 1], head) : "",
    }));
  }

  const api = { POS, POS_SHORT, PARTICLE, FORM, wordClass, verbGroup, verbType, chain };
  if (typeof module === "object") module.exports = api;
  else globalThis.mojiGrammar = api;
})();
