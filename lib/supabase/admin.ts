import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses RLS.
 *
 * USE WITH CARE. Only call this from:
 *   - Route handlers (Next.js API routes / cron endpoints)
 *   - Server Actions where you've already verified the user is allowed
 *
 * NEVER import this from a Client Component or pass anything from this client
 * back to the browser. The service role key is your "god mode" credential.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing Supabase admin environment variables");
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
