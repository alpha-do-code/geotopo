import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Clé publique uniquement (Publishable key). Sans configuration, l'application tourne en mode local.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabase: SupabaseClient | null =
  url && cle ? createClient(url, cle, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
