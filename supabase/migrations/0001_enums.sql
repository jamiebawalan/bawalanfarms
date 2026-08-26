-- 0001_enums.sql — fixed vocabularies.
-- Every enum here exists because the old spreadsheet stored these as free text
-- and accumulated variant spellings ("Farm inputs", "Farm Inputs", "Labor ", blanks).

create extension if not exists "pgcrypto";

create type expense_category as enum (
  'Labor', 'Farm Inputs', 'Farm Transport', 'Selling Transport', 'Machines', 'Miscellaneous'
);

create type expense_attribution as enum ('direct', 'split', 'farm_wide', 'capital');

-- Why a cost is genuinely un-attributable. Blank is not an allowed answer:
-- PHP 609,203 went unattributed in the old book because blank was the easiest path.
create type farm_wide_reason as enum ('vehicle', 'selling', 'general', 'animal_care');

create type labour_mode as enum ('daily', 'pakyaw', 'kasama');

create type cycle_status as enum (
  'planned', 'land_prep', 'planted', 'growing', 'harvesting', 'closed'
);

create type app_role as enum ('owner', 'manager');
