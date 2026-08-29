"""
Build js/lib/words.js and games/word-sprint/words.js.

Run by hand, and commit the output. Nothing here ships: the leading
underscore keeps this file out of the Jekyll build exactly as it keeps
_README.md out, so the site stays a pile of static files with no build step.
Re-run it only to regenerate the lists, and say so in the commit — a
regenerated list changes which words the games will accept.

    pip install --target ./pylibs wordfreq english-words
    python3 _gen_words.py

Two outputs, and the split is the point:

  js/lib/words.js          One list of ordinary English words, 4 to 15
                           letters. js/lib/dictionary.js answers from it
                           before it will consider asking anyone, so a
                           common word costs no request, no wait and no
                           connection. It is a YES-LIST ONLY: a word missing
                           from it proves nothing at all.

  games/word-sprint/words.js  Word Sprint's answer pool — the words that may
                           be the hidden word, which is a much narrower
                           question than what the game will accept. Accepting
                           is js/lib/words.js's job now.

Needs two packages that are NOT dependencies of the site and must never
become any. wordfreq ranks by frequency, which is what separates answers
everybody knows from words merely worth accepting. english-words supplies
web2, whose capitalisation is what catches proper nouns.
"""
import sys

sys.path.insert(0, './pylibs')  # see the note above
from wordfreq import top_n_list, zipf_frequency
from english_words import get_english_words_set

SHARED = 'js/lib/words.js'
SPRINT = 'games/word-sprint/words.js'

# The shared list. 4 is Honeycomb: Spelling's floor and Word Sprint's
# shortest board; 15 is past the longest word either game can produce.
MIN_LEN, MAX_LEN = 4, 15
# How far down the frequency list to go. Lower means fewer trips to a
# dictionary service and a bigger file; this is the point where the words
# stop being ones a player would plausibly type.
SHARED_CUT = 2.3

SPRINT_LENGTHS = (4, 5, 6)
# Answers stay words everybody knows. Lower than it was, deliberately: the
# pool was 700 a length and the same words came round too often.
ANSWER_CUT = 3.3
ANSWER_CAP = 2000

# Kept out of a family word game entirely. Not a complete profanity filter
# and not meant to be: it is the short list of things nobody wants on a
# scoreboard in front of a kid.
BLOCK = set("""
anal anus arse arsed arses balls ballsy bastard bimbo bitch bitched bitches
boner boobs booze bugger buggered clit cocks coitus condom crack crap crappy
cum cunt damn dammit dick dicks dildo dong dopey douche drunk dyke ejaculate
erotic fag fags fart farted fatso feces fetish fondle fuck fucked gonad grope
hell heroin hoe hooker horny incest jerk jizz junkie kike laid lesbo lube
molest moron naked nazi negro nipple nude nudes nudity nutsack orgy paki penis
perv pervy pimp piss pissed poop porn porno prick pube pubes puke pussy queer
racist rape raped raper rapes rectal rectum retard scrotum semen sexy shag
shat shit shits shitty skank slag slut sluts smut sperm spunk stiffy stoned
suck sucks testes tit tits titty tramp trash turd twat urine vagina viagra
vulva wank wanky weed whore whores wench
""".split())

# Fine to guess, wrong as an answer: first names, places, months and a couple
# of prefixes. Curated by hand from the words whose capitalised form is also a
# dictionary entry — that test alone is no good, because it also catches
# state, school, space and march. Words that merely *have* a name sense but
# earn their keep as common words (jack, nick, drew, frank, robin, mason,
# jersey, turkey, polish, butler) are deliberately left in.
NOT_ANSWERS = set("""
anti sept june mike mary tony eric alan jeff luke anna josh rick carl emma
cole jake kent kyle brad pete shaw lucy ruth marc
japan peter henry harry jimmy kelly dutch roger clark maria billy larry barry
jerry laura terry bobby perry blake tommy welsh nancy ralph colin
canada german russia martin boston jordan morgan walter carter graham steven
victor easter august
brian kevin susan diana simon derek keith wayne craig frank grant
london paris berlin moscow sydney dublin norway sweden france mexico brazil
monday friday sunday april march
""".split())


def usable(word):
    return (word.isalpha() and word.isascii() and word.islower()
            and word not in BLOCK)


def banner(out, lines):
    out('/*\n')
    for line in lines:
        out(' * %s\n' % line if line else ' *\n')
    out(' */\n')


def main():
    # web2 keeps its capitalisation, so a word that appears only as Tyler,
    # Paris, Doug or ESPN is not in it as lowercase. That is the cheap half
    # of the proper-noun filter, and it is what keeps brands and acronyms out
    # of both lists; NOT_ANSWERS is the half a machine cannot do.
    web2 = get_english_words_set(['web2'], lower=False)

    pool = [w for w in top_n_list('en', 900000) if usable(w)]
    known = set(pool)
    zipf = {w: zipf_frequency(w, 'en') for w in pool}

    # ---- the shared list ------------------------------------------------
    #
    # web2 membership matters here too, in lower case this time: wordfreq's
    # list is scraped from real text and carries plenty that is not a word —
    # abbreviations, transliterations, and the debris of tokenising the
    # internet. A word has to be in an actual dictionary to get in.
    #
    # Case-sensitive membership, the same test the answers use. Lowercasing
    # web2 first would let every proper noun through, because Doug and Judas
    # are in it capitalised; requiring the lower-case form to be a dictionary
    # entry in its own right is what keeps brands, acronyms and names out.
    # (A word like `judas` that is genuinely a lower-case English noun — a
    # peephole — stays, which is correct.)
    shared = sorted(
        w for w in pool
        if MIN_LEN <= len(w) <= MAX_LEN
        and zipf[w] >= SHARED_CUT
        and w in web2
    )

    # ---- Word Sprint's answers ------------------------------------------
    answers = {}
    for n in SPRINT_LENGTHS:
        picks = []
        # pool is in frequency order, so this takes the commonest first.
        for w in pool:
            if len(w) != n:
                continue
            if zipf[w] < ANSWER_CUT or w in NOT_ANSWERS or w not in web2:
                continue
            # No plurals as answers: the singular is the interesting word and
            # a trailing S is a free letter. Guessing them is still allowed.
            if w.endswith('s') and w[:-1] in known and len(w[:-1]) >= 3:
                continue
            picks.append(w)
            if len(picks) >= ANSWER_CAP:
                break
        answers[n] = sorted(picks)

    # Every answer has to be a word the shared list will accept, or the game
    # would refuse guesses of its own hidden word.
    shared_set = set(shared)
    for n in SPRINT_LENGTHS:
        missing = [w for w in answers[n] if w not in shared_set]
        assert not missing, 'answers missing from the shared list: %s' % missing[:5]

    with open(SHARED, 'w') as fh:
        out = fh.write
        banner(out, [
            'Ordinary English words, generated rather than written. Regenerate',
            'with _gen_words.py at the repo root; never edit this by hand.',
            '',
            'This is what lets js/lib/dictionary.js answer "is that a word?"',
            'without asking anybody: a hit costs no request, no wait and no',
            'connection, which is most of what either word game ever asks.',
            '',
            'It is a YES-LIST ONLY. A word that is not here is not thereby',
            'wrong — English is much bigger than %d words — it is merely' % len(shared),
            'unknown, and the question goes on to a dictionary service. Making',
            'a miss mean "no" would call real words wrong, which is the one',
            'thing the dictionary must never do. See CLAUDE.md.',
            '',
            'One space-separated string, split into a Set on first use: tens of',
            'thousands of quoted array entries is a hundred kilobytes of',
            'punctuation, and this file ships to phones.',
        ])
        out('window.Words = (function () {\n')
        out("  const LIST = '%s';\n\n" % ' '.join(shared))
        out("""  const MIN = %d;
  const MAX = %d;
  let set = null;

  // Built on the first question rather than at load, so a page that never
  // asks never pays for it.
  function ready() {
    if (!set) set = new Set(LIST.split(' '));
    return set;
  }

  /**
   * Is this one of the ordinary words we ship? A `false` means "not in this
   * list", never "not a word" — see the note above.
   */
  function has(word) {
    const w = String(word || '').toLowerCase();
    if (w.length < MIN || w.length > MAX) return false;
    return ready().has(w);
  }

  function size() {
    return ready().size;
  }

  return { has, size, MIN, MAX };
})();
""" % (MIN_LEN, MAX_LEN))

    with open(SPRINT, 'w') as fh:
        out = fh.write
        banner(out, [
            "Word Sprint's answer pool, generated rather than written.",
            'Regenerate with _gen_words.py at the repo root; never edit by hand.',
            '',
            'Only the hidden words live here. What the game *accepts* is a much',
            'wider question and a shared one, answered by js/lib/words.js',
            'through js/lib/dictionary.js — every word game on the site wants',
            'the same answer to it, so it is not this game\'s to hold.',
            '',
            'These are words everybody knows, which is a stricter bar than',
            'being a word: no plurals, no proper nouns, and common enough that',
            'nobody feels cheated by the reveal.',
        ])
        out('window.SprintWords = (function () {\n')
        out('  const ANSWERS = {\n')
        for n in SPRINT_LENGTHS:
            out("    %d: '%s',\n" % (n, ' '.join(answers[n])))
        out('  };\n\n')
        out("""  const LENGTHS = [%s];
  const lists = {};

  function pool(length) {
    if (!lists[length] && ANSWERS[length]) {
      lists[length] = ANSWERS[length].split(' ');
    }
    return lists[length] || null;
  }

  /**
   * Is this a word the game will accept as a guess? The shared list decides,
   * because "is that a word" is not a question about this game. Answers are
   * always acceptable, which the generator asserts, so a missing words.js
   * costs the wide list rather than the whole game.
   */
  function has(word) {
    const w = String(word || '').toLowerCase();
    if (window.Words && window.Words.has(w)) return true;
    const list = pool(w.length);
    return Boolean(list && list.indexOf(w) !== -1);
  }

  /** A puzzle: one of the words everybody knows, at that length. */
  function answer(length) {
    const list = pool(length);
    if (!list || !list.length) return '';
    return list[Math.floor(Math.random() * list.length)];
  }

  function counts() {
    const out = {};
    for (const n of LENGTHS) out[n] = { answers: (pool(n) || []).length };
    return out;
  }

  return { LENGTHS, has, answer, counts };
})();
""" % ', '.join(str(n) for n in SPRINT_LENGTHS))

    sys.stderr.write('shared: %d words (%d-%d letters)\n'
                     % (len(shared), MIN_LEN, MAX_LEN))
    for n in SPRINT_LENGTHS:
        sys.stderr.write('  answers %d: %d\n' % (n, len(answers[n])))


if __name__ == '__main__':
    main()
