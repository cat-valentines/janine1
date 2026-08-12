-- Remove the throwaway account used to verify the signup/login fix.
delete from public.player_profiles where lower(display_name) = 'zz_authtest_tmp';
delete from auth.users where email like 'zzauthtest%@gmail.com';
