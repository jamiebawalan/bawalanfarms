# Cost categories: historical → protocol

A proposal, not a change. Nothing here is built yet.

The aim is a list of activities that matches what the farm actually does under
the protocol, and a mapping that moves eighteen months of history onto it
without losing what was originally written down.

---

## What is actually wrong

The structure is sound and worth keeping. An expense carries **two** things:
a *category* (what kind of money — Labour, Farm Inputs, Machines) and an
*activity* (what work — Deweed, Abono, Tanim). That is the right pair of axes,
and most farm software only has one.

Three things are wrong with the contents.

**1. "Other" is the largest single line.** On Plot 7 it is ₱27,450, 17% of the
plot. It is free text, so it cannot be summed, compared between plots, or
matched to a protocol round. Every entry in it is a real activity that had
nowhere to go — Magnesium Sulfate, Zinc sulphate, Final Hakot and Tanim.

**2. The same work is logged under different names.** Deweed, Pakyaw Deweed,
Tabas, Tabas Mane are four codes for what is at most two jobs. `Pakyaw Deweed`
is not even a different job: `pakyaw` is a *way of paying*, and the expense row
already has a `labour_mode` column holding exactly that, with `daily`, `pakyaw`
and `kasama` as its values. So that code records the same fact twice and
splits the number for it.

**3. Food is filed as a Farm Input.** It is ₱12,627 on Plot 7 — 8% of the
plot, sitting inside "Farm Inputs" next to the fertiliser. Feeding the crew is
a real cost and belongs in the P&L, but counting it as an input makes the
input-cost-per-plant figure wrong, and that figure is one the protocol work is
meant to improve.

---

## Proposed shape

Keep the two axes. Keep the categories almost as they are — changing both
axes at once doubles the migration risk for no gain.

**Categories:** Labour, Materials, Machines, Farm Transport, Selling
Transport, Overheads.

Two changes only: `Miscellaneous` becomes `Overheads` and stops being a
dumping ground (food, repairs that are not machine-specific, animal care), and
`Farm Inputs` is renamed `Materials` so it is obvious that food does not
belong in it.

**Activities** are rebuilt from the protocol's own stages, so that "what did
this cycle cost by activity" lines up with "what does the protocol say to do".

| Stage | Activities |
|---|---|
| Land prep | Soil test · Clear the old crop · Knockdown spray · Lime or amend · Plough / deep till · Harrow · Drainage · Form beds |
| Planting | Gather planting material · Treat planting material · Plant · Replant gaps |
| Weeds | Pre-emergent spray · Spot spray · Broadcast spray · Hand weed / cut back |
| Nutrients | Side-dress · Foliar spray |
| Pests | Ant bait · Mealybug spray · Nematode spray · Scouting |
| Disease | Preventive fungicide · Treat an outbreak |
| Induction | Forcing · Differentiation check |
| Monitoring | Tissue test · Weight survey · Plant count · Photos |
| Harvest | Harvest · Stack and haul · Grade |
| Post-harvest | Remove slips · Harvest suckers · Decrown |
| Upkeep | Plot edges · Fetch water · Vine and volunteer removal |
| Machines | Fuel · Repairs · Tractor hire |
| Selling | Haul to buyer · Tolls and trucking |
| Animals | Feed · Vet and care |
| Crew | Food · Other crew costs |

---

## The mapping

**Confident** — language and group both agree.

| Historical | Becomes | Note |
|---|---|---|
| Araro (plough) | Land prep · Plough / deep till | |
| Plot Clearing | Land prep · Clear the old crop | |
| Tractor | Machines · Tractor hire | Category stays Machines |
| Tanim (plant) | Planting · Plant | |
| Pinya Planting | Planting · Plant | Same job as Tanim |
| Banana / Corn / Coffee Planting | Planting · Plant | Crop is on the cycle already |
| Suwe / Planting Material Gathering | Planting · Gather planting material | |
| Hakot Planting Material | Planting · Gather planting material | Transport category |
| Abono / Fertilizer Application | Nutrients · Side-dress | |
| Deweed | Weeds · Hand weed / cut back | |
| Pakyaw Deweed | Weeds · Hand weed / cut back | **Set `labour_mode = pakyaw`** |
| Vine Removal | Upkeep · Vine and volunteer removal | |
| Kill Saging | Upkeep · Vine and volunteer removal | |
| Plot Edging | Upkeep · Plot edges | |
| Igib (fetch water) | Upkeep · Fetch water | |
| Decrowning | Post-harvest · Decrown | |
| Harvesting | Harvest · Harvest | |
| Kamada | Harvest · Stack and haul | |
| Kalakal / Lalamove / Trucking / Toll Gate | Selling · Haul to buyer | |
| Fertilizer 21-0-0 | Nutrients · Side-dress | Material: ammonium sulfate |
| Fertilizer 0-0-60 | Nutrients · Side-dress | Material: potash |
| Fertilizer 16-20-0 | Nutrients · Side-dress | Protocol replaces this with DAP |
| Ethrel | Induction · Forcing | |
| Onecide / Diuron / Agroxone / Herbicides | Weeds · Spot spray | Material named separately |
| Insecticides | Pests · Mealybug spray | |
| Diesel / Diesel for farm hauling | Machines · Fuel | |
| Barang / Araro Repair / Mechanic | Machines · Repairs | |
| Hakot (hauling inside the farm) | Harvest · Stack and haul | |
| Animal Feed | Animals · Feed | |
| Animal Care / Vet | Animals · Vet and care | |
| Land Prep | Land prep · *(needs a sub-step)* | Generic; see questions |
| Food | **Crew · Food** | Moves out of Farm Inputs |

**Needs a decision** — I can guess, and a guess here is written into eighteen
months of history.

| Historical | My reading | Question |
|---|---|---|
| Spray | Could be herbicide, insecticide, fungicide or foliar feed | Which, usually? Or should it stay generic? |
| Liquid | Forcing — ethrel is "the liquid" | Is Liquid the forcing application? |
| Tabas (cut back) | Slashing, close to Deweed | Same job as Deweed, or a different one? |
| Tabas Mane | Unknown | What is "mane"? |
| Stab-Drop | Unknown | What is this job? |
| Pinya Trimming | Leaf trimming, no protocol equivalent | Keep as its own Upkeep activity? |
| Material Collection | Overlaps Hakot Planting Material | Planting material, or materials generally? |
| Fruiting Formula | A fertiliser, but named for forcing | Nutrients or Induction? |
| Land Prep (generic) | Covers several protocol steps | Leave generic, or split by date? |

---

## The part that needs your data

"Other" cannot be mapped from here: the answers are in the notes, which live
in the production database. Run this in the Supabase SQL editor and send the
result back, and the mapping can be finished.

```sql
select
  coalesce(activity_other_note, note, '(no note)') as what_was_written,
  count(*)                                        as entries,
  sum(amount_centavos) / 100                      as pesos
from expenses
where activity = 'other'
  and voided_at is null
group by 1
order by pesos desc;
```

It groups identical notes, so repeated ones appear once with a total. Expect
the list to be short — most farms reuse the same handful of phrases.

---

## How the migration should work

Every expense keeps what was originally entered. A recategorisation that
cannot be read back against what was actually written is one nobody can audit:
if somebody asks in March why a ₱40,000 line sits under Land prep, the answer
has to be traceable to the words typed at the time.

So the migration adds columns rather than overwriting:

- `activity` is rewritten to the new code
- `legacy_activity` keeps the old one
- `legacy_note` keeps the original free text where "Other" was used

Nothing is deleted, every row can be read both ways, and a mapping decision
that turns out wrong can be corrected later without archaeology.
