# Cost categories: historical → protocol

A proposal, not a change. Nothing here is built yet.

The aim is a list of activities that matches what the farm actually does under
the protocol, and a mapping that moves eighteen months of history onto it
without losing what was originally written down.

---

## What "Other" actually contains

The top 100 phrases are **₱397,876 across 121 entries**. Bucketed by what
they are:

| | Pesos | Entries |
|---|---:|---:|
| Vehicles and machine repair | 67,673 | 14 |
| Fertiliser bought | 58,400 | 15 |
| Peanut (*mane*) rotation | 55,000 | 4 |
| Planting and layout | 37,500 | 21 |
| Payments to people | 34,000 | 14 |
| Animals | 22,364 | 9 |
| Admin and trips | 17,350 | 7 |
| Tools and equipment | 15,989 | 10 |
| Infrastructure and clearing | 10,850 | 10 |
| Ripening and harvest | 8,950 | 6 |
| Weeds | 5,400 | 4 |

**This is not mainly a missing-pineapple-activities problem**, which is what
the first draft of this document assumed. It is four different problems that
happen to share a bucket, and they need different fixes.

### 1. Work that already had a home — about ₱102,000

`Barang (repairs, parts, diesel)` **already exists** as an activity, and
₱67,673 of vehicle and machine repair went to "Other" anyway: wrangler parts,
ball joints, chassis repair, hydroback, synchronizers.

`paid_to` **already exists** as a column, and ₱34,000 went into the note
instead: *Daddy* (8 entries), *Palabor ni Daddy*, *Severance Yoyong*.

`attribution` **already exists**, and one ₱50,000 entry reads *"Plot 25
and 26"*.

That is a quarter of the free text, and none of it is a vocabulary gap. The
right field existed and was not found. **A longer list will not fix this.**

### 2. Materials with no code — about ₱58,000

Urea, zinc sulphate, magnesium sulfate, 0-0-60, 16-20-0, extra Ethrel. These
had nowhere to go because the input catalogue was ten rows from the
spreadsheet era. `0031` has since added twenty more, so this gap is closed
going forward — the history still needs mapping.

### 3. A whole crop with no activities — ₱55,000

*Mane* is **mani**, peanut, the rotation crop. *Mane Binhi* is peanut seed at
₱50,000 — the single largest line in "Other". *Himay Mane* is shelling it;
*Mane Planting*; diesel for *mane transport*.

Which also answers a question from the first draft: **Tabas Mane is cutting
back the peanut**, not a pineapple job.

### 4. Costs that may not belong to a plot at all — about ₱17,000

A ChatGPT subscription, Agrilink trips, accommodation, newspapers and a
courier, an RFID for Balintawak, fuel for the Hilux and a taillight somebody
drove into.

These are farm *business* costs, not crop costs. If they are allocated to
plots they are inside cost per plant, which is the figure the protocol work
exists to improve. Worth knowing which, and that needs a query.

---

## The conclusion that matters

Four fifths of this is not the activity list being too short.

It is that **"Other" was easier to reach than the right field**. Anthony
typed *Daddy* into a note eight times because `paid_to` was less obvious than
a free-text box. The same thing will happen to the new list within a year
unless the entry screen changes too.

So the build is two halves and the second is the larger: rebuild the list and
migrate the history, **and make the right field the easy one at entry**.

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

## What still needs you

Five decisions. Everything else I can map from the evidence.

**1. Do the admin costs belong in the farm P&L?** ChatGPT, Agrilink trips,
accommodation, newspapers, the Balintawak RFID, Hilux fuel and the taillight
— about ₱17,000. Three answers are defensible: keep them out entirely, keep
them in as farm-wide overhead that never touches a plot, or leave them
allocated. Only the third one changes cost per plant, and it changes it
wrongly.

**2. Does peanut get its own activities?** It is ₱55,000 of real work —
seed, shelling, planting, cutting back. Either it gets its own short list, or
it shares Plant and Harvest with the crop on the cycle telling them apart.
Sharing is tidier; its own list makes "what did the peanut rotation cost"
answerable in one glance.

**3. Are tools capital or expense?** Chainsaw, mower, sprayer, knapsack, two
hoes, a weighing scale — ₱15,989. The expense table already has
`capital_asset_id`. A chainsaw used across three cycles is not a cost of the
cycle that happened to buy it.

**4. Same question for the kalabaws.** ₱7,000 across two entries, and a
carabao is not consumed by one cycle.

**5. Is Tabas the same job as Deweed?** The notes have both *Start tabas* and
*Chemical Deweed*, which reads like tabas is cutting by hand and deweed is
spraying — two methods, not one job. If so they stay separate and the new
names should say which is which.

---

## Confirmed from the notes

- **Mane = mani = peanut.** So *Tabas Mane* is cutting back the peanut.
- **Pampahinog** is the ripening agent — *Embark for pampahinog*,
  *Pampahinog Application*. The protocol's optional ripening spray at harvest.
- **Salo** appears alongside *Suwe* in *baba Salo/Suwe*, so both are planting
  material being collected.
- **Layout** is a real step in its own right — eleven entries mention it,
  usually paired with planting. It is marking out the rows before planting,
  and the protocol has no name for it.

---

## The part that needs your data

"Other" cannot be mapped from here: the answers are in the notes, which live
in the production database. Run this in the Supabase SQL editor and send the
result back, and the mapping can be finished.

Which of the admin costs are charged to plots rather than the whole farm:

```sql
select e.attribution,
       coalesce(e.activity_other_note, e.note) as what_was_written,
       e.amount_centavos / 100 as pesos
from expenses e
where e.activity = 'other' and e.voided_at is null
  and (e.activity_other_note ilike any (array[
        '%chatgpt%','%agrilink%','%accomodation%','%newspaper%',
        '%rfid%','%hilux%','%byd%','%scooter%','%phc trip%'])
    or e.note ilike any (array[
        '%chatgpt%','%agrilink%','%accomodation%','%newspaper%',
        '%rfid%','%hilux%','%byd%','%scooter%','%phc trip%']))
order by pesos desc;
```

And the full tail, since the first query stopped at 100 rows:

```sql
select count(*) as entries,
       count(distinct coalesce(activity_other_note, note)) as phrases,
       sum(amount_centavos) / 100 as pesos
from expenses where activity = 'other' and voided_at is null;
```

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
