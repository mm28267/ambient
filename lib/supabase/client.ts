import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components (anything with "use client" at the top).
 *
 * Reads the auth session from browser cookies. Safe to import anywhere in client code.
 * Don't call this in Server Components or Route Handlers — use createServerClient instead.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
