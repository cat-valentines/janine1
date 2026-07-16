-- A browsable list of signed-up players for the Friends panel, so you can see
-- and add real players without having to search a name first. Public fields
-- only (name, character, level) — never anything private. Most recently active
-- first, and the auto-generated placeholder names stay hidden.

create or replace function public.all_players()
returns table (id uuid, name text, character_id text, level integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in to see players'; end if;
  return query
    select p.user_id, p.display_name, p.selected_character, p.current_level
    from player_profiles p
    where p.user_id <> auth.uid()
      and p.display_name !~ '^player_[0-9a-f]{8}$'
    order by p.updated_at desc nulls last, lower(p.display_name)
    limit 40;
end; $$;

revoke execute on function public.all_players() from anon, public;
grant execute on function public.all_players() to authenticated;
