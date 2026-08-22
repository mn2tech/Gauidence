import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./config";

/**
 * Cookie-less anon client for public endpoints.
 * RLS still applies — never use for admin writes.
 */
export function createAnonServerClient() {
  if (!isSupabaseConfigured || !supabaseUrl || !supabaseAnonKey) return null;
  return createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
