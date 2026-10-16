"""The grammar patterns: every pattern must be found in its own example sentence, every
pattern needs a Chinese explanation, and look-alikes must not be taken for the wrong one."""

import pytest

from jpstudy import grammar
from jpstudy.words import words_of

# Sentences, what must be found in them, and what must not.
CASES = [
    ("酒は米から作られています。", {"te-iru", "rareru-passive"}, set()),
    ("財布に千円しかありません。", {"shika-nai"}, {"shika-nai-verb"}),
    ("ここで写真を撮らないでください。", {"naide-kudasai"}, {"te-kudasai", "naide"}),
    ("ここに座ってもいいですか。", {"te-mo-ii"}, {"temo"}),
    ("毎日薬を飲まなければなりません。", {"nakereba-naranai"}, {"ba", "naru"}),
    ("行かなきゃ。", {"nakereba-naranai"}, set()),
    ("日本語が話せるようになりました。", {"you-ni-naru"}, {"you-ni", "naru"}),
    ("誰か来たようです。", {"you-da"}, {"you-ni"}),
    ("明日は雨だそうです。", {"sou-hear"}, {"sou-looks"}),
    ("雨が降りそうです。", {"sou-looks"}, {"sou-hear"}),
    ("日本に来たばかりです。", {"ta-bakari"}, {"bakari"}),
    ("富士山に登ったことがあります。", {"ta-koto-ga-aru"}, {"koto-ga-aru"}),
    ("宿題をしてから遊びます。", {"te-kara"}, {"kara-reason"}),
    ("これを食べてみてください。", {"te-miru", "te-kudasai"}, set()),
    ("友達が駅まで送ってくれました。", {"te-kureru"}, set()),
    ("ここに名前を書いてください。", {"te-kudasai"}, {"te-kureru"}),
    ("雨の日は家で本を読む。", set(), {"node", "demo-even"}),
    ("駅に行くのに便利です。", set(), set()),
    ("彼は来るはずがない。", {"hazu-ga-nai"}, {"hazu"}),
    ("母は子供に野菜を食べさせました。", {"saseru"}, {"saserareru"}),
    ("子供のころ、母に野菜を食べさせられました。", {"saserareru"}, {"saseru", "rareru-passive"}),
    ("これはペンです。", set(), {"deshou", "no-desu"}),
    ("そう言っていました。", {"te-iru"}, {"to-iu"}),
    ("見るだけでいい。", {"dake"}, {"dake-de-naku"}),
    ("先生に「話しなさい」と言われた。", {"nasai", "rareru-passive"}, {"to-iu"}),
    ("正直に言ったばかりに、怒られた。", {"bakari-ni"}, {"ta-bakari"}),
    ("夏はビールに限る。", {"ni-kagiru"}, {"ni-kagirazu"}),
    ("週末に限らず混んでいる。", {"ni-kagirazu"}, {"ni-kagiru"}),
    ("食べられないことはない。", {"nai-koto-wa-nai"}, {"koto-wa-nai"}),
    ("心配することはない。", {"koto-wa-nai"}, {"nai-koto-wa-nai"}),
    ("その件はお答えしかねます。", set(), {"kanenai"}),
    ("高校時代の友達というものか。", set(), {"mono-ka"}),
    ("負けるものか。", {"mono-ka"}, set()),
    ("生まれながらに歌がうまい。", {"nagara-ni"}, {"nagara"}),
    ("感動させずにはおかない。", {"zu-ni-wa-okanai"}, {"te-oku"}),
    ("言ってくれれば手伝ったものを。", {"mono-wo"}, set()),
    ("今ご飯食べてる。", {"te-iru"}, set()),
    ("行かなくちゃ。", {"nakereba-naranai"}, {"naide"}),
    ("行かなくちゃいけない。", {"nakereba-naranai"}, {"te-iku", "te-wa-ikenai"}),
    ("行かないと。", {"nakereba-naranai"}, set()),
    ("行かないと、困る。", {"to-cond"}, {"nakereba-naranai"}),
    ("早く行かないといけない。", {"nai-to-ikenai"}, set()),
    ("ここで遊んじゃだめ。", {"te-wa-ikenai"}, set()),
    ("これは学生じゃない。", set(), {"ja-nai-q"}),
    ("明日は雨かもしれない。", {"kamoshirenai"}, {"kamo"}),
    ("明日は休みだって。", {"tte"}, {"datte-even"}),
    ("転入とかもできる。", {"toka"}, {"kamo"}),
    ("明日雨かもね。", {"kamo"}, set()),
    ("だってゆっくり休む日だから。", set(), {"datte-even"}),
    ("何だってできる。", {"datte-even"}, set()),
    ("日本語が喋れなくても大丈夫。", {"temo"}, {"naide"}),
    ("彼は野菜を食べようとしない。", {"you-to-shinai"}, {"you-to-suru"}),
    ("何が黄色なんだろうって思った。", set(), {"n-datte"}),
    ("一晩で本を読み切った。", {"kiru"}, set()),
    ("彼を代表として、会議に出す。", {"wo-to-shite"}, {"to-shite"}),
    ("言わせようとして困る。", set(), {"wo-to-shite"}),
    ("そのご意見には賛成しかねます。", {"kaneru"}, {"kanenai"}),
    ("ホストファミリーみたいなところに住んだ。", set(), {"tokoro-ni"}),
    ("道が混んでいたものだから、遅れた。", {"mono-da-kara"}, {"mono-da"}),
    ("春になり、夏になり、秋が来た。", set(), {"nari-nari"}),
    ("家に着いたところで、電話が鳴った。", set(), {"ta-tokoro-de"}),
    ("謝ったところで、許してもらえない。", {"ta-tokoro-de"}, set()),
    ("東京とは違う。", set(), {"to-wa-surprise"}),
    ("駅までだ。", set(), {"made-da"}),
    ("このアニメマジで面白い。", set(), {"majiki"}),
    ("これまでに三回行った。", set(), {"made-ni"}),
    ("雨じゃないかと思う。", set(), {"janai-ka"}),
    ("それもよかった。", set(), {"te-yokatta"}),
    ("「積読」というのは、本を買っても読まないことです。", {"to-iu-no-wa"}, {"no-wa-da"}),
    ("彼は疲れているように見えます。", {"you-ni-mieru"}, {"ni-mieru"}),
    ("散歩することにした。", {"koto-ni-suru"}, {"koto-ni-feeling"}),
]

PATTERNS = grammar.patterns()


def found_ids(text: str) -> set[str]:
    return {f["id"] for f in grammar.find(words_of(text))}


def test_ids_are_unique():
    ids = [p["id"] for p in PATTERNS]
    assert sorted({i for i in ids if ids.count(i) > 1}) == []


def test_chinese_explanations_match_the_patterns():
    assert set(grammar.explanations("en")) == {p["id"] for p in PATTERNS}


@pytest.mark.parametrize("p", PATTERNS, ids=lambda p: p["id"])
def test_pattern_found_in_its_own_example(p):
    assert p["id"] in found_ids(p["example"]), p["form"]


@pytest.mark.parametrize(("text", "want", "not_want"), CASES, ids=[c[0] for c in CASES])
def test_look_alikes(text, want, not_want):
    got = found_ids(text)
    assert not want - got, f"missing {want - got}"
    assert not got & not_want, f"should not have {got & not_want}"


def test_unknown_language_has_no_explanations():
    assert grammar.explanations("xx") == {}
