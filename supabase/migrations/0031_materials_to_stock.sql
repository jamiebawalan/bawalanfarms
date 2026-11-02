-- 0031_materials_to_stock.sql — joining the protocol to the storeroom.
--
-- Two catalogues had grown up apart. `input_types` is what the farm buys and
-- draws from stock: ten rows carried over from the spreadsheet. `materials`
-- is what the protocol prescribes: twenty-five. They overlap in five places
-- and nowhere else, so until now nothing could say that a month-9 foliar
-- round consumes the urea sitting in the shed.
--
-- One deliberate non-match: Agroxone is paraquat, not glyphosate. They are
-- different chemicals with different rules, and mapping one onto the other
-- to save creating a row would be the kind of tidy mistake that ends up
-- sprayed on a field.

-- ---------------------------------------------------------------------------
-- What the farm can buy
-- ---------------------------------------------------------------------------
-- kg_per_unit is only set where the pack size is actually known. The farm
-- buys 50 kg fertiliser sacks and that is certain; it is not certain what
-- size sack the lime or the zinc sulfate comes in, so those are measured in
-- their own base unit until somebody enters a real purchase and knows.

insert into input_types (code, label, unit, kg_per_unit) values
  ('urea',         'Urea 46-0-0',         'sack',  50),
  ('dap',          'DAP 18-46-0',         'sack',  50),
  ('epsom',        'Epsom salt',          'kg',     1),
  ('iron_sulfate', 'Iron sulfate',        'kg',     1),
  ('zinc_sulfate', 'Zinc sulfate',        'kg',     1),
  ('solubor',      'Solubor (boron)',     'kg',     1),
  ('lime',         'Agricultural lime',   'kg',     1),
  ('dolomite',     'Dolomite',            'kg',     1),
  ('rock_phos',    'Rock phosphate',      'kg',     1),
  ('glyphosate',   'Glyphosate',          'litre', null),
  ('bromacil',     'Bromacil',            'kg',     1),
  ('ametryn',      'Ametryn',             'kg',     1),
  ('hoestick',     'Hoestick (sticker)',  'litre', null),
  ('diazinon',     'Diazol 60EC',         'litre', null),
  ('sumithion',    'Sumithion 50EC',      'litre', null),
  ('movento',      'Movento 240SC',       'litre', null),
  ('ant_bait',     'Siege-Pro ant bait',  'kg',     1),
  ('pmicro',       'P-Micro Fert',        'kg',     1),
  ('koh',          'KOH',                 'kg',     1),
  ('aliette',      'Aliette 80WP',        'kg',     1)
on conflict (code) do update set
  label = excluded.label, unit = excluded.unit, kg_per_unit = excluded.kg_per_unit;

-- ---------------------------------------------------------------------------
-- Which stock a protocol material draws from
-- ---------------------------------------------------------------------------
-- Nullable on purpose. A material with no stock behind it still belongs in
-- the protocol — the app simply has nothing to propose drawing, and says so,
-- rather than refusing to show the round at all.

alter table materials
  add column if not exists input_type text references input_types(code);

comment on column materials.input_type is
  'The stock this material is drawn from. Null where the farm does not '
  'carry it as inventory, in which case completing the work proposes no draw.';

update materials m set input_type = v.input_type
from (values
  -- Already in the farm's catalogue under its spreadsheet name.
  ('amsul',        'fert_21_0_0'),
  ('mop',          'fert_0_0_60'),
  ('diuron',       'diuron'),
  ('onecide',      'onecide'),
  ('ethephon',     'ethrel'),
  -- New above.
  ('urea',         'urea'),
  ('dap',          'dap'),
  ('epsom',        'epsom'),
  ('iron_sulfate', 'iron_sulfate'),
  ('zinc_sulfate', 'zinc_sulfate'),
  ('solubor',      'solubor'),
  ('lime',         'lime'),
  ('dolomite',     'dolomite'),
  ('rock_phos',    'rock_phos'),
  ('glyphosate',   'glyphosate'),
  ('bromacil',     'bromacil'),
  ('ametryn',      'ametryn'),
  ('hoestick',     'hoestick'),
  ('diazinon',     'diazinon'),
  ('sumithion',    'sumithion'),
  ('movento',      'movento'),
  ('ant_bait',     'ant_bait'),
  ('pmicro',       'pmicro'),
  ('koh',          'koh'),
  ('aliette',      'aliette')
) as v(material, input_type)
where m.code = v.material;

-- ---------------------------------------------------------------------------
-- Where a draw came from
-- ---------------------------------------------------------------------------
-- So that a completed round and the stock it consumed can be read back
-- together, and so that undoing one can find the other.

alter table input_draws
  add column if not exists protocol_plan_id uuid
    references protocol_plan(id) on delete set null;

create index if not exists input_draws_protocol_plan
  on input_draws (protocol_plan_id) where protocol_plan_id is not null;
