# Decisions and open questions

Everything here was decided in order to keep building. Each one is written so
you can reverse it, and each says exactly what to change.

---

## The four open questions from the brief

### 1. The coffee plot (27) has no surveyed area

**Decided:** the plot exists and can carry costs and a cycle, but it has no row
in `plot_areas`, so `plot_area_on()` returns `null` rather than `0`.

Anywhere an area is needed, an unsurveyed plot is **excluded and reported**,
never silently given a zero share:

- a split that includes it apportions across the other plots and shows a warning
  naming the plot, before saving
- the farm-wide overhead pool skips it
- the settings page carries a standing notice until the area is set
- the historical import warns on every affected row

**To close it:** insert one row.

```sql
insert into plot_areas (plot_id, effective_from, area_sqm, note)
select id, '2024-01-01', 3200, 'Surveyed' from plots where code = '27';
```

Areas are effective-dated, so setting it now does not retroactively change how
older expenses were split. That is deliberate: it keeps last year's reports
stable.

---

### 2. Does the Mango plot carry a share of farm-wide overhead?

**Decided: no**, following the owner's current choice — but modelled as data,
not as code.

`plots.shares_overhead` is `false` for Mango and `true` for everything else.
`allocateFarmWide()` reads that column.

**To change it:** one update, and every report recalculates.

```sql
update plots set shares_overhead = true where code = 'Mango';
```

---

### 3. Kasama (sharecropper) plots — cost, revenue, or neither?

**Answered by the owner: neither, for now.** There is no set share, and any
split is worked out outside the app. Tenant plots — 3, 5, 16, 18 and 22, all
"Peanut - Tenant" — track their own direct costs exactly like every other plot,
because the farm does still incur costs on them.

`crop_cycles.kasama_share_pct` stays in the schema and stays null. When it is
null the cycle P&L carries no share-of-crop line at all, which is the correct
behaviour here. If a fixed split is ever agreed, setting the percentage on the
cycle turns the line on with no code change:

```sql
update crop_cycles set kasama_share_pct = 30
 where plot_id = (select id from plots where code = '16')
   and status <> 'closed';
```

The original reasoning for treating it as a cost line rather than reduced
revenue is kept below, because it is the behaviour that switches on:

> Revenue stays at full value and the tenant's share shows as a cost. Netting
> it out of revenue would make a tenant-worked plot look like it simply grew
> less fruit, and the owners would lose the ability to ask whether the
> arrangement is worth it.

---

### 3b. "Daddy" — work paid to the owner's father

**Answered by the owner: farm overhead.** Ten rows totalling ₱25,200 name
"Daddy" or "Palabor ni Daddy" where a plot would normally go. There is no rent
arrangement behind them to attribute against, so they are farm-wide with reason
`general`.

This is not a dead end: the farm-wide pool is shared out by area across the
cycles that were live on the day each cost was paid, so the money still reaches
plot-level profit — it simply is not tied to one plot at entry time. The
original wording is preserved in the activity note.

---

### 4. Quinta — a real grade, or a bulk dump?

**Decided: both are supported, and the data says which.**

Quinta stays in `products` as a genuine grade, because it is in the family's own
ordered list and removing it would make the one historical sale unrecordable.

Separately, `sale_lines.is_bulk` marks a lot sold off cheap rather than sold at
grade. The single real occurrence — 600 fruits at ₱5 — looks like a bulk dump,
so the sale form offers a "Bulk dump, not a graded sale" checkbox on every line.

Bulk lines are **excluded from realised-price averages by default** in the buyer
margin report, so one clearance sale cannot make Quinta look like it is worth ₱5
a fruit. They are still counted in revenue and in quantity sold. The report can
include them with `buyerMargins(ledger, { includeBulk: true })`.

**When importing that historical row:** tick bulk if it was a clearance.

---

## Choices where the brief invited a push-back

### Reports are tested TypeScript, not SQL views

The brief asked for reports "as views over the same data". They are views in the
sense that matters — derived, never stored — but the arithmetic lives in
`src/lib/domain/`, not in Postgres.

Why: this farm books about 700 expense rows a year. The whole history is a few
hundred kilobytes, so loading it and computing in one place costs nothing. What
it buys is 133 unit tests over the money maths, including the property that an
area split always adds back to the exact amount entered — a guarantee that is
awkward to assert about a SQL view and essential here, because the database
rejects a split that does not balance.

The invariants stay in Postgres, where they belong and where the import and any
stray SQL console are also bound by them.

**If the farm grows enough for this to hurt**, the fix is a date-windowed
`loadLedger()`. One function, not a rewrite.

### Hand-rolled components instead of shadcn/ui

shadcn/ui would have brought a dozen Radix packages for what this app uses:
buttons, fields, chips, cards, and one disclosure. Native `<details>` and
`<dialog>` handle the interactive parts with real accessibility already in them.

`src/components/ui.tsx` is about 300 lines and the whole dependency tree is 99
packages. The brief asked for something one person could maintain a year from
now, and that is the trade taken.

### The Sheets mirror runs in the app, not in a Supabase edge function

The brief suggested a Supabase edge function. The mirror needs a flat
`cycle_pnl` tab, and computing P&L in a second place — in a second language —
is exactly how a spreadsheet and an app start disagreeing about a number.

Running the mirror from a Next.js route means it calls the same tested
`allCyclePnL()` the screens call. It is scheduled by Vercel Cron
(`vercel.json`) and can be triggered from the settings page.

### A minimal XLSX reader instead of SheetJS

The `xlsx` package on npm is pinned at a version with a known prototype-pollution
advisory. `src/lib/import/xlsx.ts` reads the sheet, the shared string table and
enough of the style table to tell a date from a number, in about 150 lines on
top of `fflate`. It is tested against real .xlsx files built in the test itself.

Writing it also surfaced a real bug worth having: Excel's day-serial conversion
is one day out for any date before 1 March 1900, because Excel believes 1900 was
a leap year. Farm dates are nowhere near that, but a converter that is quietly
wrong in a corner is the kind of thing this project exists to stop inheriting.

---

## Judgement calls made while building

### Historical whole-farm rows with no reason are imported, not rejected

Rule 5 says farm-wide requires a reason, and the app enforces that with no way
around it. The **import** cannot, because a large share of the old rows are
blank and rejecting them would reject the file.

So a historical blank gets a reason inferred from its category (Machines and
Farm Transport → vehicle, Selling Transport → selling, everything else →
general) and **every one is counted in the import summary** under "Assumed on
your behalf". The owners see exactly how many and can decide.

New entries have no such escape.

### `Food` defaults to the Farm Inputs category

The brief lists Food under the **Inputs** vocabulary group, so that is the
category it pre-fills. There is a decent argument that crew food is a labour
cost; it was left matching the family's own grouping so that imported history
and new entries land in the same place and stay comparable.

This is a pre-fill, always overridable, and changing it for good is one row:

```sql
update activities set default_category = 'Labor' where code = 'food';
```

### Plot mayors are seeded as people, but not assigned

The six mayors — Jamie, Jose, Anne, Tony, Joanne, Farm People — are seeded, and
`plot_mayors` supports shared plots as two rows rather than a `"Jamie/Joanne"`
string. Which mayor holds which plot was not in the brief, and inventing an
assignment would put made-up data in the book. Assign them in SQL or through the
import.

### Two cycles per plot: one running, one queued

The brief says one open cycle per plot. Taken literally that would block
planning the pineapple that goes in the moment the peanuts come out — which is
what the family is doing right now.

So there are two partial unique indexes: at most one cycle that is neither
closed nor planned, and at most one planned cycle queued behind it. A planned
cycle spends nothing and takes no overhead share until it starts.

### A date more than 30 days ahead is refused by the database

Rule 6 asks for confirmation past today, and the form does that. The database
additionally refuses anything more than 30 days out or earlier than 2015.

Nine rows in the old book were dated a year late. A confirmation dialog catches
a slip; a constraint catches a script.
