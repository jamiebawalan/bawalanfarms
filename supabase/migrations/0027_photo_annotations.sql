-- 0027_photo_annotations.sql — marks on a photo, kept as marks.
--
-- He wants to circle the thing he is pointing at — the tip burn, the gap in
-- the row, the one plant that is wrong — and write a word next to it.
--
-- The marks are stored as shapes, not painted into the picture. Three reasons,
-- and the first is the one that matters:
--
--   Painting them in destroys the photograph. A circle drawn in the wrong
--   place, a label with a typo, a note that was right in May and wrong in
--   August: all of them permanent, against an original nobody can get back.
--   The farm's photographs are its memory of what the plots looked like, and
--   this app does not get to overwrite that because somebody drew on it.
--
--   Any mark can be removed at any time, long after it was made, because it
--   is still a thing rather than a smear of pixels.
--
--   And they survive being looked at on a different screen. Coordinates are
--   stored as fractions of the image, so a circle round a leaf tip is round
--   the same leaf tip on his phone and on her laptop.
--
-- For sending a marked-up picture to somebody outside the app, the editor
-- flattens the marks into a new photo and leaves the original alone.

alter table plot_photos
  add column if not exists annotations jsonb not null default '[]'::jsonb,
  add column if not exists annotated_at timestamptz,
  add column if not exists annotated_by text references app_users(email);

-- Shapes, and nothing else. A jsonb column with no shape to it is a column
-- that will one day hold whatever a future bug puts in it.
alter table plot_photos drop constraint if exists annotations_is_a_list;
alter table plot_photos add constraint annotations_is_a_list
  check (jsonb_typeof(annotations) = 'array' and jsonb_array_length(annotations) <= 200);

comment on column plot_photos.annotations is
  'Marks drawn on the photo: pen strokes and text labels, in coordinates that '
  'are fractions of the image so they land in the same place on any screen. '
  'The photograph itself is never painted over.';
