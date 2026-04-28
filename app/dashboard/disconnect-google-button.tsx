"use client";

import { useTransition } from "react";
import { disconnectGoogle } from "./google-actions";

export default function DisconnectGoogleButton() {
  const [isPending, startTransition] = useTransition();

  const handleDisconnect = () => {
    if (!confirm("Disconnect Google? You'll need to reconnect to get catch-up suggestions or share photos.")) return;
    startTransition(async () => {
      await disconnectGoogle();
    });
  };

  return (
    <button
      onClick={handleDisconnect}
      disabled={isPending}
      className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 hover:underline disabled:opacity-50"
    >
      {isPending ? "Disconnecting..." : "Disconnect Google"}
    </button>
  );
}
