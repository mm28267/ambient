"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createGroup } from "../actions";

const CADENCE_OPTIONS = [
  { value: 7, label: "Weekly", description: "We connect about every week" },
  { value: 14, label: "Biweekly", description: "Every other week" },
  { value: 30, label: "Monthly", description: "Once a month is the right rhythm" },
];

export default function CreateGroupForm() {
  const [cadenceDays, setCadenceDays] = useState(14);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      try {
        await createGroup(formData);
      } catch (err) {
        // Server Actions throw on failure, but successful redirects also "throw"
        // a special NEXT_REDIRECT error that we should let pass through.
        if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) return;
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  };

  return (
    <form action={handleSubmit} className="space-y-6">
      {/* Group name */}
      <div className="space-y-2">
        <label htmlFor="name" className="block text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Group name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={48}
          placeholder="College roomies"
          className="w-full px-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />
      </div>

      {/* Emoji (optional) */}
      <div className="space-y-2">
        <label htmlFor="emoji" className="block text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Emoji <span className="text-zinc-500 font-normal">(optional)</span>
        </label>
        <input
          id="emoji"
          name="emoji"
          type="text"
          maxLength={4}
          placeholder="🌊"
          className="w-24 px-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 text-center text-2xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />
      </div>

      {/* Cadence */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-50">
          How often do you want to catch up?
        </label>
        <div className="space-y-2">
          {CADENCE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`block p-4 rounded-lg border cursor-pointer transition-colors ${
                cadenceDays === opt.value
                  ? "border-green-500 bg-green-50 dark:bg-green-950/40"
                  : "border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600"
              }`}
            >
              <input
                type="radio"
                name="cadence_days"
                value={opt.value}
                checked={cadenceDays === opt.value}
                onChange={() => setCadenceDays(opt.value)}
                className="sr-only"
              />
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                {opt.label}
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                {opt.description}
              </div>
            </label>
          ))}
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 p-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 h-12 rounded-full bg-zinc-900 dark:bg-zinc-50 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed text-white dark:text-zinc-900 font-medium transition-colors"
        >
          {isPending ? "Creating..." : "Create group"}
        </button>
        <Link
          href="/dashboard"
          className="h-12 px-6 flex items-center text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
