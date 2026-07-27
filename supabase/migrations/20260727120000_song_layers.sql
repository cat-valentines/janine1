-- GarageBand-style layers: which tracks play and each track's instrument.
alter table public.songs add column layers jsonb;
