-- Optional backing singers (ooh / aah / la-la / chant) on a song.
alter table public.songs add column backing text not null default 'off';
