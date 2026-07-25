-- Which instrument plays the song's chords/melody (guitar, piano, strings…).
alter table public.songs add column instrument text not null default 'auto';
