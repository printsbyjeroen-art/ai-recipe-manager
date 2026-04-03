import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!supabaseAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

const resolvedSupabaseUrl = supabaseUrl;
const resolvedSupabaseAnonKey = supabaseAnonKey;

declare global {
  // eslint-disable-next-line no-var
  var __supabaseBrowserClient: SupabaseClient | undefined;
}

function createBrowserClient() {
  return createClient(resolvedSupabaseUrl, resolvedSupabaseAnonKey, {
    auth: {
      persistSession: true
    }
  });
}

export const supabaseBrowser: SupabaseClient =
  typeof window === "undefined"
    ? createBrowserClient()
    : (globalThis.__supabaseBrowserClient ??= createBrowserClient());

// Only require the service role key on the server. This module is imported by
// client components as well for supabaseBrowser.
const supabaseAdminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let adminClient: SupabaseClient | null = null;

if (typeof window === "undefined") {
  if (!supabaseAdminKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  adminClient = createClient(resolvedSupabaseUrl, supabaseAdminKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export const supabaseAdmin = adminClient as SupabaseClient;

