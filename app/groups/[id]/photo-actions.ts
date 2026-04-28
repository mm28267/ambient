"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * After the client uploads a file directly to Supabase Storage, it calls this
 * server action to register the photo in our database. We do this server-side
 * (rather than letting the client INSERT directly) so we can validate and add
 * group/user metadata.
 */
export async function registerPhoto(input: {
  groupId: string;
  storagePath: string;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  caption?: string;
}): Promise<{ photoId?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data, error } = await supabase
    .from("photo_events")
    .insert({
      user_id: user.id,
      group_id: input.groupId,
      storage_path: input.storagePath,
      caption: input.caption?.trim() || null,
      mime_type: input.mimeType,
      width: input.width,
      height: input.height,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to register photo:", error);
    return { error: "Couldn't save photo." };
  }
  return { photoId: data.id };
}

/**
 * Delete a photo (and its storage file). Only the uploader can delete.
 */
export async function deletePhoto(
  photoId: string
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // First fetch the row so we can delete the storage file too.
  const { data: photo } = await supabase
    .from("photo_events")
    .select("id, user_id, storage_path")
    .eq("id", photoId)
    .single();

  if (!photo) return { error: "Photo not found." };
  if (photo.user_id !== user.id) return { error: "Not your photo." };

  // Delete the storage object (best effort).
  await supabase.storage.from("group-photos").remove([photo.storage_path]);

  // Delete the row.
  const { error } = await supabase.from("photo_events").delete().eq("id", photoId);
  if (error) return { error: "Couldn't delete." };
  return { ok: true };
}
