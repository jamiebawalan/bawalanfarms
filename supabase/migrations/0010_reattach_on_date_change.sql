-- 0010_reattach_on_date_change.sql — keep costs attached to the right cycle.
--
-- An expense allocation stores the cycle it belongs to, worked out once from
-- the plot and the date. That is deliberate: it is what the owner confirmed,
-- and it must not drift on its own.
--
-- But it left a real hole. Move a cycle's start date — which the app now
-- invites, and which the owner did for plot 7 — and every cost already sitting
-- on that plot keeps pointing at the old answer. Plot 7 showed PHP 23,700 of a
-- PHP 154,196 spend, because the costs before July still belonged to nothing.
--
-- So the allocations are recomputed whenever the dates that decide them change.
-- Only the affected plot is touched, and only rows whose answer actually moves.

create or replace function reattach_plot_costs(p_plot_id uuid)
returns integer
language plpgsql as $$
declare moved integer;
begin
  update expense_allocations a
     set cycle_id = cycle_for_plot_on(a.plot_id, e.date)
    from expenses e
   where e.id = a.expense_id
     and a.plot_id = p_plot_id
     and a.cycle_id is distinct from cycle_for_plot_on(a.plot_id, e.date);
  get diagnostics moved = row_count;
  return moved;
end;
$$;

create or replace function reattach_after_cycle_change()
returns trigger language plpgsql as $$
begin
  perform reattach_plot_costs(new.plot_id);
  -- A cycle moved to another plot has to release the costs it left behind.
  if tg_op = 'UPDATE' and old.plot_id is distinct from new.plot_id then
    perform reattach_plot_costs(old.plot_id);
  end if;
  return null;
end;
$$;

drop trigger if exists crop_cycles_reattach on crop_cycles;
create trigger crop_cycles_reattach
  after insert or update of plot_id, date_started, date_planted, date_closed, status
  on crop_cycles
  for each row execute function reattach_after_cycle_change();

-- A cycle being deleted also frees its costs, which then belong to whichever
-- cycle covers their date, or to none.
create or replace function reattach_after_cycle_delete()
returns trigger language plpgsql as $$
begin
  perform reattach_plot_costs(old.plot_id);
  return null;
end;
$$;

drop trigger if exists crop_cycles_reattach_delete on crop_cycles;
create trigger crop_cycles_reattach_delete
  after delete on crop_cycles
  for each row execute function reattach_after_cycle_delete();
