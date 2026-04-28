"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFreshAccessToken } from "@/lib/google/calendar";
import { listAlbums, type Album } from "@/lib/google/photos";

/**
 * Disconnect Google Calendar/Photos. Deletes the user's row from
 * user_google_tokens, clearing tokens. Photo settings stay so we can recover
 * if they reconnect.
 */
export async function disconnectGoogle(): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("user_google_tokens")
    .delete()
    .eq("user_id", user.id);
  if (error) {
    console.error("Failed to disconnect Google:", error);
    return { error: "Couldn't disconnect." };
  }
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Fetch the user's albums from Google Photos, using their stored tokens.
 */
export async function listMyAlbums(): Promise<{ albums?: Album[]; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const admin = createAdminClient();
  const tokenInfo = await getFreshAccessToken(admin, user.id);
  if (!tokenInfo) return { error: "Google not connected (or token couldn't refresh)." };

  try {
    const albums = await listAlbums(tokenInfo.accessToken);
    return { albums };
  } catch (err) {
    console.error("Failed to list albums:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("403") || msg.toLowerCase().includes("permission")) {
      return { error: "Google didn't grant photo access. Disconnect and reconnect." };
    }
    return { error: msg };
  }
}

/**
 * Save which album the user wants to share into Ambient.
 */
export async function setAmbientAlbum(
  albumId: string,
  albumTitle: string | null
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("user_photo_settings")
    .upsert(
      {
        user_id: user.id,
        album_id: albumId,
        album_title: albumTitle,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  if (error) {
    console.error("Failed to set album:", error);
    return { error: "Couldn't save album." };
  }
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Stop sharing photos. Removes the user's user_photo_settings row.
 */
export async function clearAmbientAlbum(): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("user_photo_settings")
    .delete()
    .eq("user_id", user.id);
  if (error) {
    console.error("Failed to clear album:", error);
    return { error: "Couldn't clear." };
  }
  revalidatePath("/dashboard");
  return { ok: true };
}
