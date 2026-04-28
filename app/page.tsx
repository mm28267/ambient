import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignInButton from "./sign-in-button";

/**
 * Home page. Server Component.
 *
 * If the user is already signed in, kick them to /dashboard (or to the `next`
 * URL if one is provided — used for invite-link round-trips).
 * Otherwise, show the sign-in button.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect(next || "/dashboard");
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-black p-8">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="space-y-3">
          <h1 className="text-5xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Ambient
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            A quiet way to stay close.
          </p>
        </div>

        {error === "auth" && (
          <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 p-3 rounded-lg">
            Something went wrong with sign-in. Try again?
          </div>
        )}

        <SignInButton next={next} />

        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          We&apos;ll only read your currently-playing track and recent listens.
        </p>
      </div>
    </main>
  );
}
