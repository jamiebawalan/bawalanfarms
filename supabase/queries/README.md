# Queries

Read-only checks to run in the Supabase SQL editor. None of them change
anything.

**Run one file at a time.** The SQL editor shows only the last result set when
several statements run together, so pasting them all in gives you the answer
to the last question and silently discards the rest.

## Reconciling the cost recategorisation

Run after the catalogue migration (`0032`, `0033`).

| File | What it answers |
|---|---|
| `reconcile-1-does-it-all-add-up.sql` | **The main one.** The first three rows must add up to the fourth. |
| `reconcile-2-nothing-stranded.sql` | Should say "none — all good". |
| `reconcile-3-what-moved-where.sql` | Every old code and where it landed, with amounts, to eyeball. |
| `reconcile-4-food-category-move.sql` | How much crew food left Farm Inputs — the one intended category move. |
