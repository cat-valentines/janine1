-- One-time account fix. Email confirmation was on, so players who signed up were
-- left UNCONFIRMED and couldn't log in — even though their profile still showed on
-- the leaderboard. Confirm everyone who is stuck so they can log in to the account
-- they made. Also remove the 'apple' test player. (A no-op on a fresh database.)

update auth.users
  set email_confirmed_at = now()
  where email_confirmed_at is null;

delete from public.player_profiles where lower(display_name) = 'apple';
