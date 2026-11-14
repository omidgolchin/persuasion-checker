# Data sources

## Winning Arguments corpus (the training data)

- **What:** r/ChangeMyView threads from 1 Jan 2013 to 7 May 2015, with
  the successful/unsuccessful argument pairs compiled by the paper's
  authors: 3,051 conversations, 293,297 utterances, 4,263 pairs before
  this repo's exclusions (see `python -m src.persuasion.build_pairs`
  output in results/summary.md).
- **Paper:** Tan, C., Niculae, V., Danescu-Niculescu-Mizil, C., & Lee,
  L. (2016). *Winning Arguments: Interaction Dynamics and Persuasion
  Strategies in Good-faith Online Discussions.* Proceedings of WWW
  2016. Cite this paper when using the data, as its distributors ask.
- **Download (the authors' distribution, via Cornell's ConvoKit):**
  `http://zissou.infosci.cornell.edu/convokit/datasets/winning-args-corpus/winning-args-corpus.zip`
  (73,703,501 bytes as fetched on 2026-11-14). `make data` re-fetches
  it. Corpus documentation: ConvoKit's "Winning Arguments
  (ChangeMyView) Corpus" page; the corpus was converted to ConvoKit
  format by Andrew Szmurlo and Meir Friedenberg.
- **Terms:** the corpus is distributed by its authors for research use
  and is **not** covered by this repo's MIT license. It is not
  redistributed here: the raw download and the derived pairs file are
  git-ignored, and `make data` regenerates them. The tool's page ships
  only the fitted model weights and a handful of short example pairs
  (docs/data/examples.json), quoted the way the paper and corpus docs
  present examples. The underlying posts are Reddit users' public
  comments from 2013–2015; usernames are never used as features or
  shown by the tool.
- **How it is used:** see PLAN.md (frozen split, features, model) and
  src/persuasion/build_pairs.py (pair construction and exclusions).

## Everything else

The tool itself reads no external data: docs/data/model.json holds the
fitted weights and statistics, exported by the training run.
