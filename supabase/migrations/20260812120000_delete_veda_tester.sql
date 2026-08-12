-- Remove the 'veda' tester account (same as the 'apple' test player). Takes them
-- off the leaderboard and out of the game. A no-op on a fresh database.
delete from public.player_profiles where lower(display_name) = 'veda';
