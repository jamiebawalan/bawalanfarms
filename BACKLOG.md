# Backlog

What is agreed but not built, and the questions that block some of it.

Kept in the repository rather than in a chat thread because a conversation
scrolls away and a file does not. Anything here is a decision already taken,
so the entry says what and why, not whether.

---

## Asked for, not yet built

### 1. The seven unsettled codes

Spray, Liquid, Stab-Drop, Pinya Trimming, Material Collection, Fruiting
Formula and the generic Land Prep. They now appear in **Tidy up the costs**
alongside the free text, with the entry count, the total, and a note from one
of their expenses as a worked example — so they are answered by looking at the
money rather than by remembering.

### 2. Cost and inventory per nutrient

The protocol names twenty-five materials and `0031` gave every one of them a
purchasable input type, so **inventory is already per-nutrient**. Costs are
not: a fertiliser purchase files under `Side-dress` or `Foliar spray`, which
says what work it was for and not which substance it was.

The old list did carry the substance — `Fertilizer 0-0-60`, `Fertilizer
21-0-0` — by putting it in the activity, which conflated what a thing *is*
with what it was *for*. Collapsing those into `side_dress` was right for the
activity axis and lost the substance, which is the gap.

**The fix is a third dimension, not a longer activity list.** A nullable
`input_type` on `expenses`, asked for when the category is Materials. Then
"what did we spend on urea" reads off the substance, "what did side-dressing
cost" reads off the activity, and both come from one row.

Nothing was lost in the meantime: `legacy_activity` still holds
`fert_0_0_60`, `fert_21_0_0` and `fert_16_20_0` on every row that had them,
so the backfill is one statement whenever this is built.

### 3. Migrations are applied by hand

There is no step anywhere that pushes `supabase/migrations/` to the live
database. Vercel deploys the code; the schema is a separate manual
`supabase db push`, or a paste into the SQL editor.

This has already cost an afternoon once: phases 1 to 4 were deployed and
every plot page read "The protocol is not loaded on this farm yet", which was
the app correctly reporting that its tables did not exist. The message did its
job, but nobody should have to decode it.

Worth either a deploy step that runs the push, or a line on the owner page
that says plainly when the database is behind the code.

## Open questions

**Sacks or kilos for fertiliser.** See Phase 5 under Done: a 450 g potash
round proposes 0.009 of a sack, which is right and unreadable.

## Done

Dated by the day the work merged, newest first. Here so that nobody
re-derives a decision already taken, or re-adds something that was removed on
purpose.

### 2 November 2026 — tools, equipment and the self-suggestion bug

`Tidy up the costs` can now file something as **equipment the farm keeps**:
it records a capital asset over five years, points the expense at it, and
removes the plot allocations — which is the substance rather than a
formality, because it is what takes a chainsaw out of one cycle's cost per
plant. The screen says so on the button rather than behind it.

`0034` adds **Tools and equipment** as an activity, which is the right home
whether a particular purchase is capitalised or expensed. A ₱750 garden hoe
depreciated over sixty months is ₱12.50 a month of administration for no
insight; a ₱2,400 chainsaw is worth carrying. The difference is the
attribution, not the activity.

Also fixed: an unsettled code could be offered as the answer to itself —
"Fruiting Formula" suggested Fruiting Formula, and tapping it would have been
accepted, taking the row out of the queue with nothing answered. A screen
that can mark its own work complete is worse than no screen.

### 2 November 2026 — tidying up the costs

**Tidy up the costs**, linked from the owner page. Every phrase still filed
under "Other" and every unsettled old code, grouped by the exact words, with
the entry count and the total, biggest first. Pick what the work was and the
whole group moves; the original wording stays on every row.

A phrase used eight times is answered once. Nothing is applied without
somebody choosing it, and a phrase that meant two different things on
different days has to be split by hand — which the kept wording makes
possible afterwards.

Also: the ledger now carries `active` on an activity. Without it the expense
form would have offered all 104 codes including the 43 retired ones, which is
the opposite of what rebuilding the list was for. The cost list still prints
retired labels, because it has to render history.

And the Plan calendar has a **Month view** button on a phone. The grid is a
laptop shape by default, but that is a default rather than a rule: it scrolls
sideways rather than squeezing seven columns into 390px.

### 2 November 2026 — the three UI asks

**Protocol 101.** "What the farm knows" now opens with the crop month by
month: tap month -4 and get the land prep steps and the lime matrix, tap
month 5 and get that month's feeding and ant bait, with the protocol's own
per-plant and per-area rates. Folded shut by default, because eighteen months
of agronomy opened flat is a page nobody reaches the end of. The decisions
record sits below it as provenance rather than the front door. The page is
dynamic now: the protocol lives in the database so the owners can correct it
without a deploy.

**Plot details on the map.** Tapping a plot opens a card over the map rather
than a panel below it, carrying size, plant count, planting date and the link
through. Having to scroll the map out of the way to see what you just tapped
was what made the map ornamental. The planting date carries its year — "14
Feb" is ambiguous by exactly the amount that matters.

**Photo gallery below the viewer.** The thumbnail strip used to push the photo
he had just opened off a phone screen. The grid is the way back to the set,
which is a thing wanted second.

### 2 November 2026 — Phase 5, stock is proposed and never deducted

Marking a planned round done works out what it consumed and proposes taking
it out of stock, oldest lot first, split across lots at each lot's own price.
Every figure is editable and the whole thing can be waved off; the work is
recorded either way.

Proposed rather than applied because the stock figures are only as good as
the last count. Deducting silently would turn a counting error into a costing
error on a plot's P&L, and the farm manager is the one who knows what
actually came out of the shed.

A shortfall is said out loud rather than quietly drawing less: either the
shed is emptier than the app thinks or a purchase was never entered, and both
are worth knowing before the next trip to town.

`0031` joined the two catalogues that had grown up apart — twenty protocol
materials had no purchasable stock behind them. One deliberate non-match:
Agroxone is paraquat, not glyphosate, and mapping one onto the other to save
creating a row would be the kind of tidy mistake that ends up on a field.

**Open question for the owners:** the farm buys fertiliser in 50 kg sacks and
the protocol doses in grams, so a 450 g potash round proposes `0.009 sack`.
Correct, but not a number anyone can check by eye. Tracking fertiliser in kg
instead would read better; it is a change to how the shed is counted, so it
is not one to make quietly.

### 2 November 2026 — Phase 4, the Plan tab becomes a calendar

Tasks somebody typed and protocol rounds Anthony dated are the same thing in
the field — a job, on a day, on a plot — so they share one calendar rather
than two lists that each tell half the story of a Tuesday.

A month grid on a laptop, where the point is seeing where work bunches. A
list of overdue, today, next seven days on a phone, where a 7x5 grid of touch
targets is unreadable. The grid keeps the work on its padding days, because
the 1st falling on a Thursday does not mean Monday to Wednesday are empty.

### 2 November 2026 — Phase 3, the knapsack calculator

How much water the block takes, how many plants one 16 L tank covers, how
many tanks, and what the part-tank at the end should hold. The grams are per
plant, so a tank mixed for 190 plants and stretched over 260 underfeeds every
one of them — that is the mistake this exists to stop.

Anything under 5 g a tank is premixed: weigh the block's whole amount once on
a bench, dissolve it, pour a measured share into each tank. Zinc sulfate is
2.5 g a knapsack, and nobody weighs that on a hillside.

### 2 November 2026 — the protocol becomes the app

**Phase 0, the protocol becomes the farm's agronomy.** It leads the brief
Claude reads and is named as governing; the old notes sit after it, labelled
history that may never be offered as advice. Three corrections carried
through: forcing is on weight, MAP is not calendar age, and the definition of
the D-leaf itself was wrong — the old record described a method the farm has
abandoned.

**Phase 1, the protocol becomes a schedule.** 25 materials, 66 activities and
110 dose rows from the 1 November document, re-runnable by code so that
correcting the document corrects the app. Repeating work is one row per
round, because "month 8 mealybug spray" has to be something the app can name.
A block's stage is stored as a date, so it advances by itself.

**Phase 2, the plot page asks and answers.** Two suggestions open per block,
each with the protocol's month and how the block sits against it; the rest
one tap away. "Plan to do it" asks when and keeps that promised date through
completion, which is what the Plan calendar will read. Three answers,
including "already did it" for reconciling work the app never saw. Forcing
reads the four weight criteria off individual plants.

**The D-leaf projections were removed, not rebuilt.** `projectForcing` and
`projectHarvest` both extrapolated a date from D-leaf growth, and the
protocol treats length as reference only. Gone from the plot page, the
manager list, the Drive dossier and the briefing. **Do not re-add one.** If a
projection is wanted again it has to come from weight, and nobody has yet
said what that curve looks like.

**The plot areas in the tests.** `rules.test.sql` and `rls.test.sql` both
asserted plot 1 at 7056 m², the figure from before `0016_correct_plot_areas`
and the `0018` boundary trace. The survey says 6364.30. Both had been
failing, and the RLS one read alarmingly as a manager having rewritten a plot
area when in fact the update had been correctly refused and only the expected
value was stale. The SQL suite is green again: 58 checks.

**There is no backlog, and no `recoverable_months`.** The column asked how
many months late each activity was still worth doing, so that missed rounds
could be re-offered for as long as the agronomy allowed. It is gone. The farm
is correcting its protocols now, with a technical consultant walking the plots
one by one and soil tests coming back this month, so the catching-up is a
conversation between people; anything genuinely owed is entered by hand. The
column would also have gone stale almost at once, since its whole job was to
rank work from before the protocol was adopted.

An activity is now current for the month it belongs to and no longer — one
constant in code, nothing authored per row and nothing for an agronomist to
review. Supersession is bounded to the same window, so answering a late round
does not write off months nobody was ever shown.

**Pink disease is not being chased.** The protocol lists a spray at open
flower and flags it as an open question for fresh-market fruit in Cavite. The
activity stays seeded, because it is what the protocol says, and it carries
its own condition text saying it is unconfirmed — so if a plot ever reaches
that month it appears as a suggestion that can simply be declined. Nobody is
asking Livie about it.

---

## Longstanding

- Google Sheets mirror
- Two-column desktop cards, if the plot pages still read sparse on a laptop
