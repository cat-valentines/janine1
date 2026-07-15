-- Signing up must never fail because a username is already taken.
-- The old trigger inserted straight into player_profiles, so a clash with the
-- unique display_name index threw, rolled back the auth.users insert, and the
-- player just saw "Database error saving new user".

create or replace function public.create_new_player_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  wanted text;
  candidate text;
  suffix integer := 0;
begin
  -- Already has a profile (e.g. a replayed insert)? Leave it alone.
  if exists (select 1 from player_profiles where user_id = new.id) then
    return new;
  end if;

  wanted := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), ''), 24);
  if char_length(wanted) < 2 then
    wanted := 'player_' || left(new.id::text, 8);
  end if;
  candidate := wanted;

  -- Take the name if it's free; otherwise add a number and try again.
  loop
    begin
      insert into player_profiles (user_id, display_name) values (new.id, candidate);
      return new;
    exception when unique_violation then
      suffix := suffix + 1;
      if suffix > 200 then
        -- Give up on the pretty name rather than block the signup.
        insert into player_profiles (user_id, display_name)
        values (new.id, 'player_' || left(new.id::text, 8))
        on conflict (user_id) do nothing;
        return new;
      end if;
      candidate := left(wanted, 20) || suffix::text;
    end;
  end loop;
end; $$;

-- Lets the signup form warn about a taken username before making the account,
-- and the profile page check a new name before renaming.
-- security definer so it works while signed out, and it only ever leaks a yes/no.
-- Your own current name counts as available, so re-saving it is not an error.
-- (While signed out auth.uid() is null, so every row still counts.)
create or replace function public.username_available(name text) returns boolean
language sql security definer set search_path = public stable as $$
  select char_length(trim(name)) between 2 and 24
     and not exists (
       select 1 from player_profiles
       where lower(display_name) = lower(trim(name))
         and user_id is distinct from auth.uid()
     );
$$;

grant execute on function public.username_available(text) to anon, authenticated;
