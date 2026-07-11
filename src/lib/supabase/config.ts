export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * True when both Supabase env vars are present. Auth UI checks this so the
 * site still works (with a friendly notice) before Supabase is configured.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
