import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { joinGroup } from "../actions";

/**
 * /join/[code] — invite landing page.
 *
 * Flow:
 *   1. If the user isn't signed in, redirect to home with a `next` param.
 *   2. Look up the invite to show a preview ("Join Weekend Friends") before the join.
 *   3. Auto-join via the SECURITY DEFINER RPC and redirect to /groups/[id].
 *
 * For now we auto-join on landing — no "Accept" button. If you want a confirm
 * step, we can add it later.
 */
export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Not signed in — bounce home with a hint to come back here after auth.
    redirect(`/?next=/join/${code}`);
  }

  // Try to join. RPC returns the group id on success.
  const { groupId, error } = await joinGroup(code);

  if (error) {
    return (
      <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8 flex items-center justify-center">
        <div className="max-w-md w-full text-center space-y-6">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Invite link didn&apos;t work
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">{error}</p>
          <Link
            href="/dashboard"
            className="inline-block px-6 py-2.5 rounded-full bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 font-medium hover:opacity-90 transition-opacity"
          >
            Go to dashboard
          </Link>
        </div>
      </main>
    );
  }

  // Success — redirect to the group page.
  redirect(`/groups/${groupId}`);
}
