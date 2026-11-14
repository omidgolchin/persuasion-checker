/* Builds assist/testset.json: twenty short briefs in the exact format the
 * page composes (docs/app.js composeBrief), with the expected extraction
 * the offline eval scores against: the weaker draft and the flagged
 * add-or-strengthen labels. Scores come from the real engine.
 * Run: node scripts/build_testset.js */
"use strict";
const fs = require("fs");
const path = require("path");
const Persuasion = require(path.join(__dirname, "..", "docs", "persuasion.js"));
const model = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "docs", "data", "model.json"), "utf8"));
const engine = Persuasion.create(model);
const pct = (x) => Math.round(x * 100) + "%";

const PAIRS = [
  { op: "CMV: Tipping should be abolished and restaurants should just pay staff properly.",
    a: "Tipping is just how it works and servers would quit without it. Nobody forces you to tip a lot anyway. It has been this way forever.",
    b: "You say staff should be paid properly, and on that we agree. But in states that raised base wages while keeping tips, server income rose about 12% and turnover fell. For example, Seattle restaurants kept tipping and pay went up, not down." },
  { op: "CMV: Daylight saving time should be abolished.",
    a: "Daylight saving is annoying and pointless. Everyone hates changing clocks. It should just stop.",
    b: "You mention the clock change, and twice a year it does cost sleep. Studies link the spring shift to a 6% rise in fatal car crashes that week. For example, Arizona dropped it decades ago and reports no downside. Would a permanent standard time really hurt?" },
  { op: "CMV: College is a waste of money for most people.",
    a: "College is a scam, degrees are worthless now, tons of dropouts are billionaires. Trade school is obviously better for everyone.",
    b: "Your point about cost is real, and for some people a trade is better. But on average graduates earn about 65% more over a lifetime, and 8 of the 10 fastest growing jobs ask for a degree. Which part matters more to you, the debt or the odds?" },
  { op: "CMV: Social media should be banned for under 16s.",
    a: "Social media rots kids brains, it is obviously addictive and parents cannot control it. Ban it completely, problem solved.",
    b: "You worry about addiction, and the design is built for it. But a ban is hard to enforce: after Australia announced one, VPN downloads by teens rose 40% in a month. For example, age checks already fail on most platforms. What would make a ban work where checks have not?" },
  { op: "CMV: Zoos should be shut down.",
    a: "Zoos are prisons for animals and that is clearly cruel. Nobody learns anything real from a cage. Close them all.",
    b: "The cruelty point matters, and old style cages deserved criticism. Modern zoos are different though: accredited zoos fund about 200 million dollars a year of field conservation, and species like the Arabian oryx exist only because of zoo breeding. Does that change the calculation?" },
  { op: "CMV: The voting age should be lowered to 16.",
    a: "Sixteen year olds are too immature to vote, their brains are not developed. They would just vote for memes.",
    b: "You raise maturity, which is fair to ask about. Austria lowered the age in 2007 and 16 year olds turned out at higher rates than 18 to 21 year olds in their first elections. For example, in Takoma Park, Maryland, teen turnout beat the adult rate in local votes." },
  { op: "CMV: Homework should not exist in primary school.",
    a: "Homework is pointless busywork for little kids, they should be playing outside instead. Teachers give it out of habit.",
    b: "You are right that worksheets for their own sake help nobody. But short practice is different: ten minutes of reading aloud a day is linked to noticeably faster progress by age 10, and Finland, often praised here, still assigns light homework. Is the problem homework itself or the amount?" },
  { op: "CMV: Electric cars are worse for the environment than people think.",
    a: "EVs run on coal power and their batteries are toxic, so they are basically a scam. Gas cars are fine.",
    b: "Battery mining is a fair concern, and the grid mix matters. Even so, lifecycle studies put an average EV at roughly half the emissions of a similar gas car after about 20,000 miles, and the gap widens as grids clean up. Which stage worries you most, mining or power?" },
  { op: "CMV: Remote work is worse for companies than office work.",
    a: "Remote work kills culture and people slack off at home. Everyone knows the office is better.",
    b: "Culture is the strongest part of your case, and junior staff do lose mentoring. The output data is less clear though: a Stanford study of 16,000 workers found a 13% rise in performance at home, mostly from fewer distractions. Have you seen output drop, or mostly connection?" },
  { op: "CMV: Space exploration is a waste of money.",
    a: "Space is a rich person hobby while people starve. The money should obviously be spent on Earth.",
    b: "The priorities argument is understandable. For scale, NASA is about 0.5% of the US budget, and its past work gave us water filtration and memory foam used in hospitals. Cutting it entirely would fund food programs for days, not years. Would a smaller budget change your mind?" },
  { op: "CMV: Video games make kids violent.",
    a: "Games are full of killing so of course kids copy it. It is just common sense, look at the news.",
    b: "It is reasonable to worry when a game is graphic. The research is less settled than the news suggests: youth violence fell over the same 20 years that game sales tripled, and large studies find no clear link. For example, the APA urges caution about claiming one. What evidence would settle it for you?" },
  { op: "CMV: Cats should be kept indoors at all times.",
    a: "Outdoor cats kill birds and get run over, so keeping them in is a no brainer. Owners who let them out are irresponsible.",
    b: "The bird point is backed by data: outdoor cats kill an estimated 1.3 billion birds a year in the US. But a total indoor rule has costs too, like obesity and stress in high energy breeds. Would a leash or a catio answer your concern?" },
  { op: "CMV: Minimum wage raises just cause inflation and job losses.",
    a: "Basic economics says raising wages raises prices and kills jobs. Every business owner knows this.",
    b: "That is the textbook prediction, and it can happen in small towns with thin margins. The measured effects are smaller: a review of 138 state level raises found little job loss, and prices rose about 0.4% for a 10% raise. Does your view depend on the size of the raise?" },
  { op: "CMV: Print books are better than e-books.",
    a: "E-books feel soulless and screens tire your eyes. Real books are just better, end of story.",
    b: "The reading experience point is personal and fair. On comprehension the data is mixed but interesting: several studies find slightly better recall on paper for long texts, while e-readers win for travel and accessibility, like instant large print. Is it recall or the feel that decides it for you?" },
  { op: "CMV: The death penalty should be abolished everywhere.",
    a: "The death penalty is barbaric and the state should never kill people. It clearly does not deter anyone.",
    b: "The risk of error is the strongest argument here, and it is documented: 4% of people sentenced to death in the US were likely innocent by one careful estimate. On deterrence you are right that studies are inconclusive. Would life without parole answer the deterrence worry for you?" },
  { op: "CMV: University lectures should all be recorded.",
    a: "Recording everything makes students lazy and kills attendance, professors hate it. Just show up.",
    b: "Attendance is a real concern, and some lecturers do see drops. The gains are concrete though: students with jobs or disabilities rely on recordings, and one university found grades rose 5% for students who rewatched difficult lectures. Could recording only the hard weeks work?" },
  { op: "CMV: Four day work weeks would hurt productivity.",
    a: "Working less obviously means producing less. Companies that try it are just doing PR.",
    b: "If hours were the whole story, I would agree. In the largest trial, 61 UK companies, revenue stayed flat while sick days fell 65%. For example, Microsoft Japan reported output up 40% in its trial month. Are you picturing the same hours squeezed, or genuinely fewer?" },
  { op: "CMV: Fast food should be taxed like cigarettes.",
    a: "Fast food is poison and people cannot help themselves, tax it until nobody buys it.",
    b: "The health costs you cite are real. A tax hits unevenly though: Mexico's soda tax cut purchases about 7%, mostly in low income homes, which is both the point and the problem. Would you tax the sugar content rather than the restaurant?" },
  { op: "CMV: Learning a second language is pointless now that AI translates everything.",
    a: "Translation apps do it all instantly, so language classes are a total waste of time in 2026.",
    b: "For travel and menus, you are right, the apps are excellent. They are weaker where it matters socially: job ads still pay a premium for bilingual staff, and studies link bilingualism to later onset of dementia symptoms by about 4 years. Is your claim about tourists or about careers?" },
  { op: "CMV: Pet ownership is selfish and should be discouraged.",
    a: "Pets are just status objects and breeding them is cruel. People should stop buying animals, period.",
    b: "Breeding practices deserve the criticism, puppy mills especially. The broader claim is harder: shelter adoption is not purchase of a status object, and pet owners show lower rates of loneliness in several surveys. For example, guide dogs are hardly selfish. Where would you draw the line?" }
];

function gains(d, winner) {
  const wK = winner === "B" ? "contribB" : "contribA";
  const lK = winner === "B" ? "contribA" : "contribB";
  const rawW = winner === "B" ? d.featuresB : d.featuresA;
  const rawL = winner === "B" ? d.featuresA : d.featuresB;
  const add = [], pull = [];
  d.contribs.forEach((c) => {
    const gain = c[wK] - c[lK];
    if (gain <= 0.1) return;
    if (c.weight > 0 && rawL[c.key] < rawW[c.key]) add.push({ label: c.label, gain });
    else if (c.weight < 0 && rawL[c.key] > rawW[c.key]) pull.push({ label: c.label, gain });
  });
  add.sort((x, y) => y.gain - x.gain);
  pull.sort((x, y) => y.gain - x.gain);
  return { add: add.slice(0, 3), pull: pull.slice(0, 1) };
}

/* Drafts above are written strong-second; flip these indexes so the
 * weaker draft is B in a third of the set (the eval must not be passable
 * by always answering A). */
const FLIP = new Set([1, 5, 8, 12, 15, 18]);

const items = PAIRS.map((p0, i) => {
  const p = FLIP.has(i) ? { op: p0.op, a: p0.b, b: p0.a } : p0;
  const d = engine.decide(p.op, p.a, p.b);
  if (d.state === "invalid") throw new Error("pair " + i + " invalid");
  const weaker = d.winner === "B" ? "A" : "B";
  const g = gains(d, d.winner);
  const addLabels = g.add.map((x) => x.label);
  const lines = [
    "Original view:", p.op, "",
    "Draft A:", p.a, "",
    "Draft B:", p.b, "",
    `The tool scored draft A at ${pct(1 - d.pB)} and draft B at ${pct(d.pB)} likely to persuade. Weaker draft: ${weaker}.`,
    "Flagged features for the weaker draft to add or strengthen: " +
      (addLabels.length ? addLabels.join("; ") : "none clear; strengthen the weakest passages directly") + "."
  ];
  if (g.pull.length) lines.push(`The weaker draft also overdoes: ${g.pull[0].label}. Pull back on that.`);
  return {
    id: "brief-" + String(i + 1).padStart(2, "0"),
    text: lines.join("\n"),
    expected: { weaker, features_to_add: addLabels }
  };
});

fs.writeFileSync(path.join(__dirname, "..", "assist", "testset.json"), JSON.stringify(items, null, 1) + "\n");
items.forEach((it) => console.log(it.id, it.text.length, "chars | weaker", it.expected.weaker, "| add:", it.expected.features_to_add.join("; ") || "(none)"));
const over = items.filter((it) => it.text.length > 1000);
console.log("items:", items.length, "| over 1000 chars:", over.length);
