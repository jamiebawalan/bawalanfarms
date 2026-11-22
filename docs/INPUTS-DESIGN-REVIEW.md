# Buying and using inputs — design review

Written 22 November 2026, before any code. For Jamie to decide on, and for a
developer to execute afterwards.

---

## The headline

**Most of what you asked for already exists.** Requests 1 and 3 are built and
working at `/inputs` — a two-tab card with "Record a purchase" and "Take stock
out". They are not in the Log tab and barely reachable, so the work is mostly
moving and renaming. Request 2 is a labelling job. Request 4 is the only
genuinely new screen, and it reuses a component we already have.

**But the review found four live faults, all verified in the code.** Three of
them affect money that is on screen today, and two of them I introduced in the
last fortnight. They are listed before the decisions because some of them
change what the decisions are.

---

## Four things that are wrong today

### 1. Cash on hand ignores every stock purchase

`src/lib/domain/cash.ts:54` computes Anthony's float as advances minus
**expenses**. Purchases are invisible to it. So if he buys ₱275,000 of
fertiliser out of his float and records it correctly, the app still says that
₱275,000 is in his pocket.

A wrong number about real money, on screen now, before anything is built.

### 2. Block costs contain no fertiliser at all

`subPlotLedger` is built only from expense allocations
(`src/app/cycles/[id]/page.tsx:104-119`); it has no notion of a draw
(`src/lib/domain/subplots.ts`, zero mentions). Draws reach the **cycle**
(`src/lib/domain/pnl.ts:108-121`) and stop there.

So every block's cost per plant is missing all fertiliser and chemical cost —
on a farm where fertiliser is the largest line. The block comparison, which is
the entire reason blocks exist, is being computed without the biggest number
in it. **This is mine**, from the sub-plot and Phase 5 work.

### 3. Undoing a protocol round leaves its stock gone

`DELETE /api/protocol` removes the plan row and carefully revives the rounds it
superseded. It does not touch `input_draws` — zero mentions in that function.
The foreign key is `on delete set null`, so the draws survive with their link
cut: the cost stays on the plot for ever, the stock stays gone, and nothing in
the app can explain where either came from.

**Also mine.** I wrote a comment in that same function saying an undo must not
lose work silently, and then missed the stock half of it.

### 4. A multi-row draw can be recorded twice

The write queue (`src/lib/queue.ts`) retries a failed request and relies on a
client-generated row id colliding on the primary key to make the replay
harmless. That is how every other write in the app is protected.

The protocol's draw insert (`/api/protocol/route.ts:136-144`) does not supply
ids — the database generates them. So if the request reaches the server and the
response is lost on the way back, which is exactly what a patchy signal does,
the retry inserts the draws **again**: double stock deduction, double cost,
silently. **Mine as well**, from Phase 5.

---

## The decisions

### 1. Should a draw know which block it went on?

Today it records a plot, not a block. Everything in the protocol layer is
per-block.

- **Leave it at plot level.** Free. But when he fertilises only the May block,
  the cost is divided across both by plant count — wrong, and wrong in the
  direction that flatters the block that was not fed.
- **Add an optional block.** A nullable column; empty keeps meaning "the whole
  plot, divide it", which is already how shared expenses work. Nothing breaks,
  because nothing reads it yet.

**Recommended: optional.** There is a free backfill available — draws made
through the protocol already carry their plan row, and the plan row knows the
block.

### 2. Does the per-plot screen replace the protocol flow, or join it?

This is the most consequential decision on the list.

You already have "mark the month-9 foliar done → confirm what came out of the
shed". Request 4 is "here is my inventory, I used this much on this plot".

If those are two separate doors, **Anthony will always use the new one**,
because it never asks him which activity it was. The protocol plan then fills
with rounds that stay "scheduled" for ever while the fertiliser they specify
demonstrably left the shed. You would have built a stock system that quietly
dismantles the agronomy system.

**Recommended: one door.** The per-plot screen is primary. When a protocol
round is due on that block it offers it at the top — "this looks like the
month-9 foliar" — with the amounts pre-filled. He taps it and the round closes;
he ignores it and the draw is still recorded. One action, one record. Both
paths write through one endpoint.

### 3. Sacks or kilos?

The protocol doses in grams. The shed counts 50 kg sacks. A 450 g potash round
is **0.009 of a sack** — correct, and impossible to check by eye.

Request 4's whole premise is Anthony typing amounts into boxes. `0.134` and
`1.34` look alike at arm's length in sunlight, and that is a ten-times costing
error.

**Recommended: count fertiliser in kilos.** 450 g becomes 0.45 kg, a number
that matches what he is holding. Cost is a one-off conversion of existing
purchases and draws; the 92 sacks become 4,600 kg. If you are not ready for
that, show both — "0.45 kg (0.009 sack)" — but do not leave bare sack
fractions in front of him.

### 4. Should "Buy inputs" also create a cost entry?

**No, and this one is firm.** Buying is not a cost; drawing is. That is the
whole design, and it is the fix for the ₱275,000 lot that was attributed to
nothing.

Every way of also writing an expense double-counts: filed to plots it charges
them immediately for stock not yet used; filed as overhead it spreads across
every plot *and* charges the draw again later.

**But the trap already exists without this build.** Nothing stops the same
sack being logged as a Farm Inputs expense in the Log tab *and* entered as a
purchase *and* then drawn. There is no guard and no reconciliation screen.
Worth a one-off check of the history before trusting any plot P&L.

### 5. First-in-first-out, or average cost?

Today a draw is priced at the lot it came from, oldest first. Potash bought at
₱1,100 in June and ₱1,400 in October means November's plot is charged ₱1,100.

**Recommended: keep it.** It is the only costing a farm without an accountant
can audit by walking to the shed and reading the receipts. The price-rise
question belongs in a separate report — "what we paid per kilo, by month" —
not in the plot's cost.

### 6. Who can add a new product to the list?

Only owners can change the catalogue, deliberately. Which means that standing
at the agrovet with a bag of something new, Anthony's options are: pick the
wrong one, pick a vague one, or not record it. He will pick the third.

**Recommended: keep it owner-only, add an escape hatch.** A "something else"
option that records the purchase with the name he typed, pending your
classification in one tap.

### 7. What happens when he uses more than the app thinks exists?

The fertiliser is already on the plants. An app that refuses to record what
happened teaches him to stop telling it.

**Recommended: record it, flag the discrepancy.** Today the warning is shown in
the moment and then lost. It should become a line on the Farm tab — "stock the
app cannot account for" — because that difference is either an unrecorded
purchase or a miscount, and both are worth knowing.

---

## Things you may not have considered

**Count the shed before any of this ships.** The 92 sacks is purchases minus
*recorded* draws, and not every application was recorded. If the real number is
84, every shortfall warning for the next six months is noise and Anthony learns
to tap past all of them.

**Cost per plant will jump**, on every block, the moment fertiliser enters
block costs. Nobody did anything wrong; the old number was incomplete. Expect
it or you will spend a week hunting a bug that is a fix.

**A draw against the wrong plot cannot currently be undone by the person who
made it** — there is no delete path anywhere in the app, and only owners may
delete in the database. After request 4, where the design is deliberately
quick, this will happen weekly.

**Four sub-tabs is too many first decisions** for one hand in a field. Better:
Log has Cost and Inputs; Inputs has Buy and Use; and request 4's door is not in
Log at all — it is one button on the plot page he is already looking at.

---

## What I would build, in order

**Before any new screen** — these are fixes, not features:

1. Reconcile the Farm Inputs expense history against purchases; count the shed.
2. Make cash on hand count stock purchases.
3. Feed draws into block costs. No migration needed.
4. One endpoint for stock leaving the shed, with per-line ids so a replay is
   harmless; point the protocol flow at it too.
5. A reversal path, and make the protocol undo use it.

**Then the four requests, in value order:**

6. **Request 2** — group the list into Crop care / Crop protection / Forcing,
   show the protocol's names, retire four dead entries. A day's work and it is
   what you actually noticed.
7. **Request 4** — the plot-page button. It matches how he works and it is now
   mostly wiring.
8. **Requests 1 and 3** — relocate and rename under Log.
9. The optional block on a draw, once 3 proves the read side works.

**Do not build:** an expense row alongside a purchase; a second category column
duplicating what the protocol already knows; a required block on a draw; a hard
refusal when stock runs short; or a per-plot screen that does not offer the due
protocol round.
