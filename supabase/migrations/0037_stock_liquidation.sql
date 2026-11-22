-- 0037_stock_liquidation.sql
--
-- Stock can leave the shed without going onto a plot.
--
-- We over-bought fertiliser and have started selling the surplus. Before this
-- migration the only way to reduce a lot was to draw it onto a cycle, which
-- would have charged a plot for fertiliser it never received.
--
-- The fix is a third kind of outflow on the table that already exists, not a
-- new table. The balance trigger below, every "remaining" figure on the Stock
-- screen, and the FIFO proposal all count rows in input_draws. A separate
-- disposals table would be invisible to all of them, and the same sack could
-- then be both sold and applied.
--
-- So: cycle_id becomes nullable, and a reason says which kind of outflow this
-- is. The check constraint keeps the two honest — stock applied to a crop must
-- name the cycle it went onto; stock sold must not name one, because no plot
-- consumed it.
--
-- Deliberately NOT recorded here: the money received. Nothing in this app is a
-- sale of anything but pineapples, and inventing a revenue line for fertiliser
-- would put it in the harvest P&L. The consequence, stated plainly: the value
-- of sold stock leaves the books with no trace of the proceeds. If Anthony
-- holds that cash, cash on hand will read lower than the shed box.

alter table input_draws
  alter column cycle_id drop not null;

alter table input_draws
  add column if not exists reason text not null default 'applied';

alter table input_draws
  drop constraint if exists draw_reason_known;
alter table input_draws
  add constraint draw_reason_known
    check (reason in ('applied', 'sold'));

-- Applied stock has a cycle; sold stock does not. One constraint, both ways.
alter table input_draws
  drop constraint if exists draw_cycle_matches_reason;
alter table input_draws
  add constraint draw_cycle_matches_reason
    check ((reason = 'applied') = (cycle_id is not null));

-- The cycle-open guard is shared with harvests, sales and plant counts, whose
-- cycle_id is still not null. It only needs to stop looking up nothing.
create or replace function assert_cycle_open()
returns trigger language plpgsql as $$
declare
  c crop_cycles%rowtype;
begin
  -- importing() is the historical-import escape hatch from 0003; it must stay.
  if new.cycle_id is null or importing() then return new; end if;
  select * into c from crop_cycles where id = new.cycle_id;
  if c.status = 'closed' then
    raise exception 'cycle % is closed; reopen it before adding %', new.cycle_id, tg_table_name;
  end if;
  return new;
end;
$$;
