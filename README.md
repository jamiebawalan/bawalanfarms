# Farm Tracker

A mobile-first web app for a small family pineapple farm in the Philippines.
Three people use it, at roughly two transactions a day.

It answers one question well: **for a given plot and crop cycle, did we make
money?**

---

## Why it is shaped like this

It replaces an Excel workbook that stopped being trustworthy. The failures were
specific, and each one is designed out rather than discouraged:

| What went wrong in the workbook | What stops it here |
|---|---|
| `24/2` and `17, 18` typed into a plot column; Excel turned thirteen rows into dates | Plots are chips. There is no text field to mistype. |
| `Fertilizer Application`, `Fertlizer Application 21-0-0`, `Abono Apply`, `Abono Application` — four strings, one activity | Activities come from a table. The one escape, `other`, demands a note. |
| `Farm inputs`, `Farm Inputs`, `Labor `, `Miscelaneous`, blanks | Category is a Postgres enum. |
| ₱609,203 unattributed, because blank was the easiest path | Blank is unreachable. Whole-farm is an explicit choice and demands a stated reason. |
| ₱275,000 of fertiliser bought in one lot and attributed to nothing | Stock is stock. Buying is not a cost; drawing is, against the cycle that used it. |
| 171 of 664 rows were `Food`, mostly untagged | After a labour entry, the app offers to log the crew's food against the same plots. |
| Nine rows dated a year late | The form asks for confirmation; the database refuses anything over 30 days out. |
| Amounts retyped and disagreeing with their own working | `amount = unit price × quantity`, computed live, enforced by a check constraint. |

Where a rule could live in the database, it lives in the database — so the app,
the historical import and any stray SQL console are all held to it. See
`supabase/tests/rules.test.sql`, which proves each one by trying to break it.

---

## Getting it running

### 1. Supabase

Create a project, then apply the migrations in order:

```bash
supabase link --project-ref YOUR_REF
supabase db push
```

Or paste `supabase/migrations/*.sql` into the SQL editor, lowest number first.

Then add the three people who may sign in. This table **is** the access list —
there is no second list to keep in step:

```sql
insert into app_users (email, role, display_name) values
  ('owner@example.com',   'owner',   'Sister'),
  ('husband@example.com', 'owner',   'Husband'),
  ('manager@example.com', 'manager', 'Brother');
```

In **Authentication → Providers**, enable Email and turn on magic links. Turn
off "Allow new users to sign up" — anyone not in `app_users` can obtain a
session but every table will return nothing to them.

### 2. The app

```bash
cp .env.example .env.local     # fill in the Supabase URL and keys
npm install
npm run dev
```

### 3. Deploy

Push to Vercel and set the same environment variables. `vercel.json` schedules
the nightly Sheets refresh; set `CRON_SECRET` so only Vercel can call it.

### 4. Google Sheets mirror (optional)

Create a Google Cloud service account with the Sheets API enabled, share the
target spreadsheet with the service account's email as an Editor, and set
`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` and
`SHEETS_SPREADSHEET_ID`.

The mirror is **one way**. Nothing is ever read back from Sheets.

---

## Checks

```bash
npm test                                        # 133 unit tests
npm run typecheck
npm run build

PGURL="-h /tmp -p 5433 -U postgres" ./scripts/db-test.sh   # 38 database checks
```

`db-test.sh` builds a throwaway database, applies every migration to it, and
runs two suites against real Postgres: `rules.test.sql` tries to break each
invariant, and `rls.test.sql` runs as an ordinary role to prove that an email
not in `app_users` sees nothing at all. It needs a Postgres you can create
databases on; pass connection flags in `PGURL`.

---

## How it is laid out

```
supabase/migrations/     schema, rules, seed, RLS, write API, import
supabase/tests/          proves the database refuses what it should
src/lib/domain/          all the money maths, pure and tested
src/lib/import/          xlsx/csv reading and row validation
src/lib/sheets/          the one-way mirror
src/lib/db/              loads the ledger, maps snake_case to camelCase
src/components/          UI primitives and the entry forms
src/app/                 pages and API routes
```

### The model

**Crop cycle** is the centre of it. One crop, in one plot, from land prep to the
final harvest — and the thing P&L attaches to, *not* the plot. A cycle can run
18 months and does not fit inside a calendar year.

A plot runs **one live cycle at a time**, plus at most one **planned** cycle
queued behind it — which is what the family is doing now, with peanuts coming
out and pineapple going straight back in. Both rules are partial unique indexes,
so they hold even if the app is bypassed.

**Costs reach a cycle from exactly three places:**

1. expense allocations tagged to it — direct and split entries
2. input draws — stock leaving a bulk lot
3. its area share of the farm-wide overhead pool

Capital never reaches a cycle. Buying a chainsaw is not a cost of growing this
pineapple; it is depreciated separately in the capital register.

**Time series are never overwritten.** Plot areas and plant counts are
effective-dated, so a February dose keeps using February's count after August's
recount, and re-surveying a plot does not rewrite how a two-year-old expense was
split.

**Money is integer centavos everywhere.** Never a float.

### Splits

A shared cost is apportioned by plot area, preserving the family's existing
convention, using largest-remainder apportionment so the lines always add back
to the exact amount entered — the database rejects a split that does not
balance. The result is shown in pesos before saving and each line can be
overruled, because he was standing in the plot and we were not.

A plot with no surveyed area cannot take a share and is reported by name.
Treating "unknown" as zero would quietly hand its share to its neighbours.

### The gap that must stay visible

`unattachedCosts()` lists money logged against a plot on a day when no cycle was
open. It is not lost — it belongs to the plot — but it reaches no profit figure,
and left invisible that gap is how this becomes the old spreadsheet again. It is
flagged on the home screen and has its own report.

---

## The historical import

`/import`, owners only. Two phases:

**Check the file** reads it and reports what would happen, writing nothing:
how many rows are good, what was assumed, and every rejection with a reason in
plain language. Nothing is ever dropped in silence.

**Import** hands the same parse to one transactional Postgres function. A batch
that fails halfway leaves nothing behind. Rows are keyed on the file name plus
the row number, so a corrected file **replaces** its own rows rather than adding
a second copy — which matters, because the file will be run more than once.

Each imported cost attaches to whichever cycle was open on that plot on that
date, which is what turns a flat list of rows into per-cycle profit. Backdating
onto cycles that closed years ago is allowed for the import and nothing else.

Accepts `.xlsx` and `.csv`. It needs a date column and an amount column;
category, activity, plot, rate, quantity, payee and notes are used when present,
under whichever of several common header names the sheet happens to use.

---

## Design notes

Built for a phone held one-handed in a plot at midday. Contrast well past the
accessibility minimum, no thin grey-on-white anywhere, 48px minimum tap targets
and 56px for the primary controls, and number pads rather than keyboards on
every numeric field.

Signal on the farm is good, so this is not offline-first. It makes the smaller
promise that matters as much: once he taps Save, the entry is his. A failed
write is queued on the phone and retried on reconnect, keyed on a
client-generated row id so a replay can never duplicate a row. A rejected entry
stays visible rather than being retried into silence.

Currency is PHP, formatted `₱1,234`. Dates read `04 Mar 2024`, never
`03/04/2024`.

---

## Deliberately not built

Payroll, invoicing, tax reporting, weather, IoT, multi-farm tenancy, GIS,
forecasting, and any login for people outside the family.

---

Assumptions, reversals and the four open questions from the brief are in
[DECISIONS.md](DECISIONS.md).
