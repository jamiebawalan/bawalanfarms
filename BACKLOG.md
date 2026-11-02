# Backlog

What is agreed but not built, and the questions that block some of it.

Kept in the repository rather than in a chat thread because a conversation
scrolls away and a file does not. Anything here is a decision already taken,
so the entry says what and why, not whether.

---

## Asked for, not yet built

### 1. "What the farm knows" becomes Protocol 101

`src/app/knowledge/page.tsx`

Today the page is a flat list of numbered decisions, which reads like a
reference and is used like one — rarely. It should be organised the way the
protocol is: **by month after planting**, each month a row that expands into
the step-by-step detail for that month.

So month −4 collapses to "soil testing and land prep" and expands into the
lime matrix, the ripping depth, the moisture test, the 21-day wait. The
decisions record stays underneath as the provenance, not the front door.

This is the same spine as the plot page's suggestion list, read the other way
round: there, "what is due on this block"; here, "what the whole crop looks
like". The data for it already exists — `protocol_activities` is ordered by
`map_month` and carries the instruction text.

### 2. Plot modals on the farm map

`src/components/farm-map.tsx`

Tapping a plot opens a panel *below* the map, so acting on it means scrolling
past the whole map first. It should be a modal over the map, carrying:

- area in hectares
- plant count
- when it was planted
- a link through to the plot page

The link already exists in the panel; the area and plant count do not.

### 3. Photo gallery moves below the viewer

`src/components/plot-photos.tsx`

The thumbnail grid currently sits above the viewer, zoom, editor and caption.
It should sit below them: the grid is a way back to the set, not the thing you
came for, and putting it first pushes the photo you opened off the screen.

---

## Protocol phases still to come

| Phase | What |
|---|---|
| 3 | Fertiliser mix calculator — per-knapsack doses, mixing order, and a premix path for the sub-5 g products nobody can weigh in a field |
| 4 | Plan becomes a month agenda. Planned work now carries `due_on`, which is what a calendar reads |
| 5 | Inventory draw-down when a planned activity is marked done |

---

## Open questions

None outstanding.

## Done

Dated by the day the work merged, newest first. Here so that nobody
re-derives a decision already taken, or re-adds something that was removed on
purpose.

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
