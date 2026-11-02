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

Each of these blocks something above, and none can be answered from the code.

**Plot 1's area.** `supabase/tests/rules.test.sql` asserts 7056 m²; the
boundary computes 6364.30 m². The test fails on `main` and stops the whole SQL
suite on its first error. Picking a number is a judgement about the boundary
re-trace, not a thing to guess — likely the same ~0.37% area correction
already noted. **Which figure is right?**

**`recoverable_months`.** How many months late each protocol activity is still
worth doing. The values in `0029_protocol_seed.sql` are first drafts written
to be corrected; they decide what Anthony is shown and what quietly closes, so
a wrong one either nags him about work nobody can do or hides work that still
matters. **Wants an agronomist's pass.**

**Pink disease.** The protocol itself flags it as an open item for
fresh-market fruit in Cavite. Seeded with `condition` saying so rather than
left out. **Ask Livie before spending on it.**

---

## Longstanding

- Google Sheets mirror
- Two-column desktop cards, if the plot pages still read sparse on a laptop
- The harvest projection: removed rather than rebuilt, because every version
  derived a date from D-leaf length. If a projection is wanted again it has to
  come from weight, and nobody has yet said what that curve looks like.
