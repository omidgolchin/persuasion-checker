/* The AI assist's prompt configuration: "Suggest an edit".
 * Shared by the page (app.js) and the extraction test (scripts/eval_assist.js),
 * so the test scores exactly the prompt visitors get.
 *
 * Unlike the sibling tools' assists, this one is generative: the brief the
 * page composes already contains the tool's scores and the features the
 * weaker draft is missing, and the model returns a rewrite of that draft.
 * The score never comes from the model: app.js re-scores the edited text
 * with the trained model in persuasion.js.
 */
(function (g) {
  "use strict";
  var ASSIST_CONFIG = {
    title: "Suggest an edit.",
    lede: "The tool names the weaker draft and where it loses ground. The model rewrites that draft to fix those things, keeping its claims and its voice; the tool then re-scores the edit with the same trained model. The model never produces the score.",
    placeholder: "The tool fills this in with your drafts and its scores when you open the assist. You can also paste a brief in the same shape.",
    examples: [
      { label: "Sample brief", text: "Original view:\nCMV: Homework should be banned in primary school.\n\nDraft A:\nHomework is bad because kids hate it and it takes time they could spend playing. Everyone knows practice is boring. Teachers only assign it out of habit.\n\nDraft B:\nYou mention stress in your post, and that is the strongest part of your case. But practice is how skills stick: for example, ten minutes of math problems a day measurably improves retention, and 3 studies of primary schools found no link between light homework and anxiety.\n\nThe tool scored draft A at 38% and draft B at 62% likely to persuade. Weaker draft: A.\nFlagged features for the weaker draft to add or strengthen: Gives examples; Uses numbers; Covers the poster's points." }
    ],
    instructions: "The brief below gives an original view, two drafts arguing against it, the tool's scores, which draft is weaker, and a line of flagged features the weaker draft should add or strengthen. Return three fields. weaker: the letter of the weaker draft, copied from the brief. features_to_add: the flagged features, copied exactly as listed in the brief (an array of the label strings). edited_draft: a full rewrite of the weaker draft. Rules for the rewrite: keep the draft's position, claims and voice; add or strengthen only the flagged features, using material the brief already contains (do not invent facts, statistics, studies or URLs; if a flagged feature would need evidence the brief does not contain, strengthen the other flagged features instead and work the poster's own points harder); speak to the poster where the flagged features call for it; keep the length within about half again the original. For edited_draft's quote, copy the exact opening phrase (first few words) of the weaker draft as pasted in the brief.",
    fields: [
      { key: "weaker", label: "Weaker draft", type: "text" },
      { key: "features_to_add", label: "Features to add or strengthen", type: "array" },
      { key: "edited_draft", label: "Edited weaker draft", type: "text", help: "quote: the opening phrase of the weaker draft, copied exactly" }
    ]
  };
  if (typeof module !== "undefined" && module.exports) module.exports = ASSIST_CONFIG;
  g.ASSIST_CONFIG = ASSIST_CONFIG;
})(typeof window !== "undefined" ? window : globalThis);
