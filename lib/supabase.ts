import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!supabaseAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export const supabaseBrowser = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true
  }
});

// Only require the service role key on the server. This module is imported by
// client components as well for supabaseBrowser.
const supabaseAdminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (typeof window === "undefined" && !supabaseAdminKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseAdminKey ?? supabaseAnonKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

