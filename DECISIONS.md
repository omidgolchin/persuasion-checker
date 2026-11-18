# Decisions log

Choices made while building, with the reason for each. Per the program
rules: where the spec left a choice open, the more conservative option
was taken and logged here; nothing waited on a human checkpoint. The
model plan itself (split, features, model, metrics) is frozen in
PLAN.md and is not relitigated here.

1. **The corpus is used exactly as its authors distribute it.** The
   Winning Arguments corpus (via ConvoKit) stores Reddit text
   HTML-escaped, so quote markers appear as `&gt;`. Pair construction
   and training took the text as distributed; unescaping it first
   would have made the training data differ from the authors' release
   for no measured benefit (the tokenizer reduces `&gt;` to the token
   "gt", a small constant presence in both classes). The page examples
   are unescaped for display only (point 7); the page re-scores what
   it shows, so their verdicts stay honest.

2. **Pairwise logistic regression, symmetric rows, no intercept.**
   Training on feature differences (winner minus loser, plus the
   negated copy of every row) makes the model antisymmetric by
   construction: swapping the drafts negates the score. A pointwise
   "score each draft" model was rejected because it cannot control
   the topic, which is the entire point of the paired design.

3. **Calibration on a carved-out slice, not cross-fitting.** The
   authors' dev conversations were split by `sha1(conv_id) % 5 == 0`
   into 684 calibration pairs, leaving 2,772 for fitting. Cross-fitting
   would have used the data harder but made the shipped artefact
   harder to describe honestly; the frozen plan chose the clean split.

4. **The op_overlap weight is reported as found: negative.** Word
   overlap with the original post is two features here on purpose:
   op_coverage (share of the poster's content words a draft touches,
   weight +0.06) and op_overlap (share of the draft that is the
   poster's own content words, weight -0.44). Coverage helps slightly;
   echoing hurts. The page's driver text and the README say so plainly
   rather than rounding the finding into "engage with the post".

5. **Equal length means truncation, not adjustment.** The
   length-controlled score cuts the longer draft at a word boundary
   to the shorter draft's length and re-scores. It answers the exact
   question a writer asks ("is B only winning because it is longer?")
   without inventing a debiasing formula.

6. **The out-of-domain rule is two cheap signals, openly listed.**
   Style heuristics (very short drafts, marketing or legal phrase
   density) plus a style-distance check: a draft whose mean absolute
   standardized feature vector exceeds the 95th percentile of dev
   drafts is flagged. The verdict stays visible under a warning
   rather than being suppressed; the reasons print in the check.

7. **Examples are real held-out pairs, trimmed, winner as Draft B.**
   Four pairs come from the held-out split (the model never trained
   on them); trimming cuts whole trailing sentences only, and because
   the page scores the visible text, the displayed verdict is the
   trimmed text's real verdict. Two labeled synthetics cover states
   the mined pairs did not produce cleanly (very short drafts,
   marketing copy). Real pairs were preferred wherever one landed in
   the needed state.

8. **URL state is length-guarded.** Drafts are carried in the link
   only while the three texts total at most 1,600 characters; beyond
   that the link falls back to the plain tool URL instead of growing
   without bound. Copy summary always works regardless.

9. **The assist is generative, and the eval knows it.** "Suggest an
   edit" returns a rewrite (edited_draft), which no extraction test
   can grade against an expected string: scripts/eval_assist.js will
   count edited_draft as "invented" by construction, because the
   testset carries no expected value for it. Field accuracy for this
   assist is read on weaker and features_to_add only. The rewrite's
   quote points at the weaker draft's opening words in the brief, so
   the shared quote-verification still has something real to check.

10. **The assist brief's flags use a gain threshold of 0.1 log-odds.**
    A feature is flagged "add or strengthen" only where the stronger
    draft's contribution beats the weaker's by more than 0.1. On the
    default example the add-list is therefore empty and the brief
    says so: that pair's gap is an overuse problem (echoing), which
    the brief's pull-back line names. A lower threshold produced
    longer, weaker advice in testing.

11. **The testset keeps the sibling tools' 1,000-character fixture
    budget.** The page composes briefs from full drafts and they run
    longer; the offline testset uses compact draft pairs in the same
    format so fixtures stay reviewable, and both sides of "weaker"
    appear (14 A, 6 B) so the eval cannot be passed by always
    answering A.

12. **Model and examples ship as generated script files as well as
    JSON.** docs/model-data.js and docs/examples-data.js are emitted
    by the training and example scripts from the canonical JSON in
    docs/data/, so the page needs no fetch and also works from
    file://, the way the sibling tools embed their result tables.

13. **No model API calls were made for this build.** The assist runs
    only with a visitor's own key. The planned TF-IDF and LLM-judge
    comparison is recorded in the README's Research notes as future
    work with no results claimed; SPEND.md is $0.

14. **The verdict shows the brief's gains line, without the assist.**
    The "what the model rewards" guidance was previously computed only
    inside the "Suggest an edit" brief, which sits behind a visitor's
    API key, so most visitors never saw the most actionable part of
    the verdict. The verdict now renders the same gainsFor()
    computation (same 0.1 log-odds threshold, point 10) as a line of
    its own: the weaker draft named, its largest "add or strengthen"
    gap phrased as what the model scores higher ("Draft A would
    score higher with links to evidence" — the features are
    associations from ChangeMyView, so the wording is about the
    model's scoring, not a promise about persuading), the top
    feature's plain-language gloss attached, and an "overdoes" line
    for the pull-back feature. It is guidance, not an edit: nothing is
    rewritten, no key is involved, and no score changes — swapping
    the drafts swaps the named draft, an applied edit re-derives the
    line from the new pair like every other verdict element, and the
    line hides when no feature clears the threshold or the pair
    cannot be scored. The copied summary carries the line too, so
    the surfaces agree. Because the line sits inside the aria-live
    verdict, typing does not recompute it per keystroke: it updates
    about 600 ms after typing stops, while page load, example swaps
    and applied edits update it at once. A page-level check
    (scripts/page_check.js, run by tests/test_page.py) renders the
    page in a headless browser and asserts all of this, because
    rendering changes previously shipped with no automated test; in
    CI the check fails rather than skips when no headless browser
    is available.
