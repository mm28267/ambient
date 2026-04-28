import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CreateGroupForm from "./create-group-form";

/**
 * /groups/new — create a new group.
 * Server Component shell that just gates the page on auth and renders the form.
 */
export default async function NewGroupPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8">
      <div className="max-w-md mx-auto space-y-8 pt-12">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            New group
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Groups are small — 3 to 6 close friends works best. You&apos;ll get an
            invite link after this.
          </p>
        </div>

        <CreateGroupForm />
      </div>
    </main>
  );
}
