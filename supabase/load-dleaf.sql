-- ---------------------------------------------------------------------------
-- The D-leaf readings the farm already has
-- ---------------------------------------------------------------------------
-- Twenty plants per plot per date, taken on 1 May and 1 June 2026 and kept in
-- the owner's own workbook until now. Loaded plant by plant, not as averages,
-- so the spread survives — the whole reason the individual rows exist.
--
-- Safe to run twice. Each reading is found by plot code and date, and the
-- plants are replaced rather than added to, so a second run leaves exactly the
-- same numbers rather than doubling them.

do $$
declare
  v_cycle uuid;
  v_measurement uuid;
  v_plot uuid;
  v_missing text := '';
begin

  -- Plot 10, 2026-05-01: 20 plants, average 54.60 cm
  select id into v_plot from plots where code = '10';
  if v_plot is null then
    v_missing := v_missing || ' plot 10';
  else
    v_cycle := cycle_for_plot_on(v_plot, date '2026-05-01');
    if v_cycle is null then
      v_missing := v_missing || ' plot 10 on 2026-05-01';
    else
      insert into leaf_measurements (cycle_id, date, avg_length_cm, sample_size, note)
      values (v_cycle, date '2026-05-01', 54.60, 20,
              'From the farm workbook, Sheet11')
      on conflict (cycle_id, date) do update
        set note = excluded.note
      returning id into v_measurement;

      if v_measurement is null then
        select id into v_measurement from leaf_measurements
         where cycle_id = v_cycle and date = date '2026-05-01';
      end if;

      delete from leaf_plant_readings where measurement_id = v_measurement;
      insert into leaf_plant_readings (measurement_id, plant_no, length_cm)
      select v_measurement, n, v
        from unnest(array[52,52,53,56,33,55,45,66,40,53,54,60,45,65,40,64,74,70,58,57]::numeric[]) with ordinality as t(v, n);
    end if;
  end if;

  -- Plot 10, 2026-06-01: 20 plants, average 56.60 cm
  select id into v_plot from plots where code = '10';
  if v_plot is null then
    v_missing := v_missing || ' plot 10';
  else
    v_cycle := cycle_for_plot_on(v_plot, date '2026-06-01');
    if v_cycle is null then
      v_missing := v_missing || ' plot 10 on 2026-06-01';
    else
      insert into leaf_measurements (cycle_id, date, avg_length_cm, sample_size, note)
      values (v_cycle, date '2026-06-01', 56.60, 20,
              'From the farm workbook, Sheet11')
      on conflict (cycle_id, date) do update
        set note = excluded.note
      returning id into v_measurement;

      if v_measurement is null then
        select id into v_measurement from leaf_measurements
         where cycle_id = v_cycle and date = date '2026-06-01';
      end if;

      delete from leaf_plant_readings where measurement_id = v_measurement;
      insert into leaf_plant_readings (measurement_id, plant_no, length_cm)
      select v_measurement, n, v
        from unnest(array[55,59,62,59,70,52,70,52,56,62,43,50,63,55,52,60,44,64,45,59]::numeric[]) with ordinality as t(v, n);
    end if;
  end if;

  -- Plot 14, 2026-06-01: 20 plants, average 40.10 cm
  select id into v_plot from plots where code = '14';
  if v_plot is null then
    v_missing := v_missing || ' plot 14';
  else
    v_cycle := cycle_for_plot_on(v_plot, date '2026-06-01');
    if v_cycle is null then
      v_missing := v_missing || ' plot 14 on 2026-06-01';
    else
      insert into leaf_measurements (cycle_id, date, avg_length_cm, sample_size, note)
      values (v_cycle, date '2026-06-01', 40.10, 20,
              'From the farm workbook, Sheet11')
      on conflict (cycle_id, date) do update
        set note = excluded.note
      returning id into v_measurement;

      if v_measurement is null then
        select id into v_measurement from leaf_measurements
         where cycle_id = v_cycle and date = date '2026-06-01';
      end if;

      delete from leaf_plant_readings where measurement_id = v_measurement;
      insert into leaf_plant_readings (measurement_id, plant_no, length_cm)
      select v_measurement, n, v
        from unnest(array[32,40,48,38,40,36,32,38,44,32,46,34,44,37,26,51,55,41,53,35]::numeric[]) with ordinality as t(v, n);
    end if;
  end if;

  -- Plot 20, 2026-05-01: 20 plants, average 56.65 cm
  select id into v_plot from plots where code = '20';
  if v_plot is null then
    v_missing := v_missing || ' plot 20';
  else
    v_cycle := cycle_for_plot_on(v_plot, date '2026-05-01');
    if v_cycle is null then
      v_missing := v_missing || ' plot 20 on 2026-05-01';
    else
      insert into leaf_measurements (cycle_id, date, avg_length_cm, sample_size, note)
      values (v_cycle, date '2026-05-01', 56.65, 20,
              'From the farm workbook, Sheet11')
      on conflict (cycle_id, date) do update
        set note = excluded.note
      returning id into v_measurement;

      if v_measurement is null then
        select id into v_measurement from leaf_measurements
         where cycle_id = v_cycle and date = date '2026-05-01';
      end if;

      delete from leaf_plant_readings where measurement_id = v_measurement;
      insert into leaf_plant_readings (measurement_id, plant_no, length_cm)
      select v_measurement, n, v
        from unnest(array[67,56,62,65,64,64,56,49,45,43,46,79,72,52,27,45,63,51,60,67]::numeric[]) with ordinality as t(v, n);
    end if;
  end if;

  -- Plot 20, 2026-06-01: 20 plants, average 59.50 cm
  select id into v_plot from plots where code = '20';
  if v_plot is null then
    v_missing := v_missing || ' plot 20';
  else
    v_cycle := cycle_for_plot_on(v_plot, date '2026-06-01');
    if v_cycle is null then
      v_missing := v_missing || ' plot 20 on 2026-06-01';
    else
      insert into leaf_measurements (cycle_id, date, avg_length_cm, sample_size, note)
      values (v_cycle, date '2026-06-01', 59.50, 20,
              'From the farm workbook, Sheet11')
      on conflict (cycle_id, date) do update
        set note = excluded.note
      returning id into v_measurement;

      if v_measurement is null then
        select id into v_measurement from leaf_measurements
         where cycle_id = v_cycle and date = date '2026-06-01';
      end if;

      delete from leaf_plant_readings where measurement_id = v_measurement;
      insert into leaf_plant_readings (measurement_id, plant_no, length_cm)
      select v_measurement, n, v
        from unnest(array[57,62,44,61,60,58,67,63,62,64,50,62,55,57,62,59,62,67,52,66]::numeric[]) with ordinality as t(v, n);
    end if;
  end if;

  -- Plot 21, 2026-05-01: 20 plants, average 59.55 cm
  select id into v_plot from plots where code = '21';
  if v_plot is null then
    v_missing := v_missing || ' plot 21';
  else
    v_cycle := cycle_for_plot_on(v_plot, date '2026-05-01');
    if v_cycle is null then
      v_missing := v_missing || ' plot 21 on 2026-05-01';
    else
      insert into leaf_measurements (cycle_id, date, avg_length_cm, sample_size, note)
      values (v_cycle, date '2026-05-01', 59.55, 20,
              'From the farm workbook, Sheet11')
      on conflict (cycle_id, date) do update
        set note = excluded.note
      returning id into v_measurement;

      if v_measurement is null then
        select id into v_measurement from leaf_measurements
         where cycle_id = v_cycle and date = date '2026-05-01';
      end if;

      delete from leaf_plant_readings where measurement_id = v_measurement;
      insert into leaf_plant_readings (measurement_id, plant_no, length_cm)
      select v_measurement, n, v
        from unnest(array[47,58,53,58,66,56,58,60,57,57,74,63,50,67,47,68,57,71,54,70]::numeric[]) with ordinality as t(v, n);
    end if;
  end if;

  -- Plot 21, 2026-06-01: 20 plants, average 62.05 cm
  select id into v_plot from plots where code = '21';
  if v_plot is null then
    v_missing := v_missing || ' plot 21';
  else
    v_cycle := cycle_for_plot_on(v_plot, date '2026-06-01');
    if v_cycle is null then
      v_missing := v_missing || ' plot 21 on 2026-06-01';
    else
      insert into leaf_measurements (cycle_id, date, avg_length_cm, sample_size, note)
      values (v_cycle, date '2026-06-01', 62.05, 20,
              'From the farm workbook, Sheet11')
      on conflict (cycle_id, date) do update
        set note = excluded.note
      returning id into v_measurement;

      if v_measurement is null then
        select id into v_measurement from leaf_measurements
         where cycle_id = v_cycle and date = date '2026-06-01';
      end if;

      delete from leaf_plant_readings where measurement_id = v_measurement;
      insert into leaf_plant_readings (measurement_id, plant_no, length_cm)
      select v_measurement, n, v
        from unnest(array[60,67,58,70,54,57,60,60,62,62,68,70,58,68,65,70,55,65,69,43]::numeric[]) with ordinality as t(v, n);
    end if;
  end if;

  -- Plot 23, 2026-05-01: 20 plants, average 36.50 cm
  select id into v_plot from plots where code = '23';
  if v_plot is null then
    v_missing := v_missing || ' plot 23';
  else
    v_cycle := cycle_for_plot_on(v_plot, date '2026-05-01');
    if v_cycle is null then
      v_missing := v_missing || ' plot 23 on 2026-05-01';
    else
      insert into leaf_measurements (cycle_id, date, avg_length_cm, sample_size, note)
      values (v_cycle, date '2026-05-01', 36.50, 20,
              'From the farm workbook, Sheet11')
      on conflict (cycle_id, date) do update
        set note = excluded.note
      returning id into v_measurement;

      if v_measurement is null then
        select id into v_measurement from leaf_measurements
         where cycle_id = v_cycle and date = date '2026-05-01';
      end if;

      delete from leaf_plant_readings where measurement_id = v_measurement;
      insert into leaf_plant_readings (measurement_id, plant_no, length_cm)
      select v_measurement, n, v
        from unnest(array[37,40,30,37,38,26,43,46,37,28,44,27,33,41,20,29,44,52,45,33]::numeric[]) with ordinality as t(v, n);
    end if;
  end if;

  -- Plot 23, 2026-06-01: 20 plants, average 38.05 cm
  select id into v_plot from plots where code = '23';
  if v_plot is null then
    v_missing := v_missing || ' plot 23';
  else
    v_cycle := cycle_for_plot_on(v_plot, date '2026-06-01');
    if v_cycle is null then
      v_missing := v_missing || ' plot 23 on 2026-06-01';
    else
      insert into leaf_measurements (cycle_id, date, avg_length_cm, sample_size, note)
      values (v_cycle, date '2026-06-01', 38.05, 20,
              'From the farm workbook, Sheet11')
      on conflict (cycle_id, date) do update
        set note = excluded.note
      returning id into v_measurement;

      if v_measurement is null then
        select id into v_measurement from leaf_measurements
         where cycle_id = v_cycle and date = date '2026-06-01';
      end if;

      delete from leaf_plant_readings where measurement_id = v_measurement;
      insert into leaf_plant_readings (measurement_id, plant_no, length_cm)
      select v_measurement, n, v
        from unnest(array[35,30,32,39,43,24,40,30,36,46,27,34,40,27,44,39,38,50,56,51]::numeric[]) with ordinality as t(v, n);
    end if;
  end if;

  -- Plot 24, 2026-05-01: 20 plants, average 47.80 cm
  select id into v_plot from plots where code = '24';
  if v_plot is null then
    v_missing := v_missing || ' plot 24';
  else
    v_cycle := cycle_for_plot_on(v_plot, date '2026-05-01');
    if v_cycle is null then
      v_missing := v_missing || ' plot 24 on 2026-05-01';
    else
      insert into leaf_measurements (cycle_id, date, avg_length_cm, sample_size, note)
      values (v_cycle, date '2026-05-01', 47.80, 20,
              'From the farm workbook, Sheet11')
      on conflict (cycle_id, date) do update
        set note = excluded.note
      returning id into v_measurement;

      if v_measurement is null then
        select id into v_measurement from leaf_measurements
         where cycle_id = v_cycle and date = date '2026-05-01';
      end if;

      delete from leaf_plant_readings where measurement_id = v_measurement;
      insert into leaf_plant_readings (measurement_id, plant_no, length_cm)
      select v_measurement, n, v
        from unnest(array[48,49,53,48,43,52,39,33,37,40,52,56,43,65,45,57,38,62,36,60]::numeric[]) with ordinality as t(v, n);
    end if;
  end if;

  -- Plot 24, 2026-06-01: 20 plants, average 50.50 cm
  select id into v_plot from plots where code = '24';
  if v_plot is null then
    v_missing := v_missing || ' plot 24';
  else
    v_cycle := cycle_for_plot_on(v_plot, date '2026-06-01');
    if v_cycle is null then
      v_missing := v_missing || ' plot 24 on 2026-06-01';
    else
      insert into leaf_measurements (cycle_id, date, avg_length_cm, sample_size, note)
      values (v_cycle, date '2026-06-01', 50.50, 20,
              'From the farm workbook, Sheet11')
      on conflict (cycle_id, date) do update
        set note = excluded.note
      returning id into v_measurement;

      if v_measurement is null then
        select id into v_measurement from leaf_measurements
         where cycle_id = v_cycle and date = date '2026-06-01';
      end if;

      delete from leaf_plant_readings where measurement_id = v_measurement;
      insert into leaf_plant_readings (measurement_id, plant_no, length_cm)
      select v_measurement, n, v
        from unnest(array[54,44,39,50,48,48,52,35,47,56,51,49,48,56,53,63,55,51,60,51]::numeric[]) with ordinality as t(v, n);
    end if;
  end if;

  if v_missing <> '' then
    raise notice 'No open cycle found for:%', v_missing;
    raise notice 'Those readings were skipped. Everything else loaded.';
  end if;
end $$;

select p.code as plot, m.date, m.avg_length_cm, m.sample_size,
       min(r.length_cm) as shortest, max(r.length_cm) as tallest
  from leaf_measurements m
  join crop_cycles c on c.id = m.cycle_id
  join plots p on p.id = c.plot_id
  join leaf_plant_readings r on r.measurement_id = m.id
 group by p.code, m.date, m.avg_length_cm, m.sample_size
 order by p.code::int, m.date;
