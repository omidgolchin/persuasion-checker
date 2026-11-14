# PLAN.md — the model behind Which Draft Persuades? (frozen before training)

Written before any model was trained. The tool itself is specced in the
tools_v3 program (`P15v2_which-draft-persuades.md`); this plan covers only
the trained model the tool ships, because that part is a small study and
follows the study discipline: frozen split, pre-specified features, every
outcome reported.

## Question

On paired ChangeMyView arguments (two top-level replies to the same
original post, one of which earned the poster's delta), how well can an
interpretable logistic regression on plain text features tell which reply
persuaded? The model must be simple enough that its weights ship as JSON
and the browser re-scores drafts with exactly the same arithmetic.

## Data

- Source: the Winning Arguments corpus as distributed by ConvoKit
  (`winning-args-corpus`), the authors' own distribution for Tan,
  Niculae, Danescu-Niculescu-Mizil & Lee (WWW 2016). See
  DATA_SOURCES.md for the download and terms.
- A pair = one original post (title + body) and the two top-level
  comments the authors paired: one from a thread that earned a delta
  ("winner"), one from a matched thread that did not ("loser"). The
  draft scored is the top-level comment text only.
- Exclusions, decided now: pairs where either comment's text is empty,
  "[deleted]" or "[removed]", or under 5 tokens. Counts are reported in
  results/summary.md.

## Split (frozen)

- The corpus carries the original paper's own conversation-level split
  (`train` flag in conversations.json). Pairs from `train = 1`
  conversations are the development side; pairs from `train = 0`
  conversations are the held-out test side. No pair crosses sides,
  because pairs live inside one conversation.
- Within the development side, conversations whose SHA-1 hash of the
  conversation id is divisible by 5 form the calibration subset (about
  20%); the rest fit the logistic regression. Calibration fits a Platt
  (a, b) map on the raw score, nothing else.
- The test side is touched once, to produce the reported numbers.

## Features (pre-specified, all interpretable)

Computed per draft, given the original post text. Word lists and the
tokenizer live in `src/persuasion/feature_config.json`, the single
source the Python and JavaScript implementations both read.

1. `log_words` — log(1 + word count). Length.
2. `op_overlap` — share of the draft's distinct content words that also
   appear in the original post.
3. `op_coverage` — share of the original post's distinct content words
   that the draft uses.
4. `you_rate` — second-person words per 100 words.
5. `i_rate` — first-person words per 100 words.
6. `question_rate` — question marks per 100 words.
7. `example_rate` — example phrases ("for example", …) per 100 words.
8. `number_rate` — tokens containing a digit, per 100 words.
9. `hedge_rate` — hedge words per 100 words.
10. `link_count` — links (URLs or markdown links), capped at 3.
11. `agree_rate` — acknowledgement markers ("thanks", "good point", …)
    per 100 words.
12. `mean_sent_len` — words per sentence.

## Model

- Each draft's features are standardized with the development-fit
  subset's means and standard deviations (stored in the model file).
- Training rows are feature differences, winner minus loser and the
  symmetric loser minus winner, with labels 1 and 0. Logistic
  regression, no intercept, L2 with C = 1.0 (scikit-learn defaults
  otherwise). The probability that draft B beats draft A is
  sigmoid(a · (w · (z_B − z_A)) + b) with the Platt (a, b) from the
  calibration subset.
- Report, whatever they come out as: held-out paired accuracy (chance
  is 50%), the reliability table (predicted-probability deciles against
  actual win rate on the test side), expected calibration error, and
  the fitted weights. Null or weak results are reported, not tuned away:
  no feature or hyperparameter changes after seeing test numbers. Any
  change after this freeze goes in the amendment log below and the
  model is retrained from scratch with the test side re-touched once.

## Amendment log

- (empty at freeze time)
