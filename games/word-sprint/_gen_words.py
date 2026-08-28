"""
Build games/word-sprint/words.js.

Run by hand, and commit the output. Nothing here ships: the leading
underscore keeps this file out of the Jekyll build exactly as it keeps
_README.md out, so the site stays a pile of static files with no build step.
Re-run it only to regenerate the list, and say so in the commit — a
regenerated list changes which words the game will accept.

Needs two packages that are NOT dependencies of the site and must never
become any:

    pip install --target ./pylibs wordfreq english-words
    python3 _gen_words.py > words.js

wordfreq ranks by frequency, which is what separates answers everybody knows
from guesses merely worth accepting. english-words supplies web2, whose
capitalisation is what catches proper nouns — see _README.md.
"""
import sys
sys.path.insert(0, './pylibs')  # see the note above
from wordfreq import top_n_list, zipf_frequency
from english_words import get_english_words_set

LENGTHS = (4, 5, 6)
GUESS_CUT = 2.5      # the "wide" list: most things a player would try
ANSWER_CUT = 3.9     # answers stay words everybody knows
ANSWER_CAP = 700

# Kept off a family word game entirely — as answers and as guesses. Not a
# complete profanity filter and not meant to be: it is the short list of
# things nobody wants on a scoreboard in front of a kid.
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
""".split())


def usable(word):
    return (word.isalpha() and word.isascii() and word.islower()
            and word not in BLOCK)


def main():
    # web2 keeps its capitalisation, so a word that appears only as Tyler or
    # Paris is not in it as lowercase. That is the cheap half of the
    # proper-noun filter; NOT_ANSWERS is the half a machine cannot do.
    web2 = get_english_words_set(['web2'], lower=False)
    pool = [w for w in top_n_list('en', 400000) if usable(w)]
    known = set(pool)
    zipf = {w: zipf_frequency(w, 'en') for w in pool}

    guesses, answers = {}, {}
    for n in LENGTHS:
        at_length = [w for w in pool if len(w) == n]
        guesses[n] = sorted(w for w in at_length if zipf[w] >= GUESS_CUT)

        picks = []
        for w in at_length:
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

    out = sys.stdout.write
    out('/*\n')
    out(' * The word lists, generated rather than written. See _README.md.\n')
    out(' *\n')
    out(' * Two lists per length. `answers` is words everybody knows, which is\n')
    out(' * what a puzzle may be; `guesses` is everything the game will accept as\n')
    out(' * a try, which is much wider and includes every answer. Stored as one\n')
    out(' * space-separated string per length and split on first use: 17,000-odd\n')
    out(' * quoted array entries is most of a hundred kilobytes of punctuation,\n')
    out(' * and this file ships to phones.\n')
    out(' *\n')
    out(' * A word missing from `guesses` is not proof of anything: the game\n')
    out(' * asks js/lib/dictionary.js, which remembers the answer. This file is\n')
    out(' * generated — never edit it by hand.\n')
    out(' */\n')
    out('window.SprintWords = (function () {\n')
    out('  const ANSWERS = {\n')
    for n in LENGTHS:
        out("    %d: '%s',\n" % (n, ' '.join(answers[n])))
    out('  };\n\n')
    out('  const GUESSES = {\n')
    for n in LENGTHS:
        out("    %d: '%s',\n" % (n, ' '.join(guesses[n])))
    out('  };\n\n')
    out("""  const LENGTHS = [4, 5, 6];
  // Split once, on the first question asked of a length, rather than at load.
  const sets = {};
  const lists = {};

  function ready(length) {
    if (!sets[length] && GUESSES[length]) {
      sets[length] = new Set(GUESSES[length].split(' '));
      lists[length] = ANSWERS[length].split(' ');
    }
    return Boolean(sets[length]);
  }

  /** Is this a word the game will accept as a guess? */
  function has(word) {
    const w = String(word || '').toLowerCase();
    return ready(w.length) ? sets[w.length].has(w) : false;
  }

  /** A puzzle: one of the words everybody knows, at that length. */
  function answer(length) {
    if (!ready(length)) return null;
    const list = lists[length];
    return list[Math.floor(Math.random() * list.length)];
  }

  function counts() {
    const out = {};
    for (const n of LENGTHS) {
      ready(n);
      out[n] = { answers: lists[n].length, guesses: sets[n].size };
    }
    return out;
  }

  return { LENGTHS, has, answer, counts };
})();
""")


main()
