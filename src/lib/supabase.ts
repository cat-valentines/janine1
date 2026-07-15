import { createClient } from '@supabase/supabase-js';

// Keys come from .env.local when running locally, and from Vercel → Settings →
// Environment Variables in production.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// A clear error beats a blank white screen when the keys are missing.
if (!url || !anonKey) {
  throw new Error(
    'Supabase keys are missing. Copy .env.example to .env.local and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  );
}

export const supabase = createClient(url, anonKey);
