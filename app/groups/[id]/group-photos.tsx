"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { registerPhoto, deletePhoto } from "./photo-actions";
import type { Member } from "./group-tiles";

export type GroupPhoto = {
  id: string;
  user_id: string;
  group_id: string;
  storage_path: string;
  caption: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
};

type Props = {
  groupId: string;
  members: Member[];
  initialPhotos: GroupPhoto[];
  currentUserId: string;
  /** Public URL prefix for the bucket; e.g. https://...supabase.co/storage/v1/object/public/group-photos */
  publicUrlBase: string;
};

const SUPPORTED_MIME = /^image\/(jpe?g|png|webp|gif|heic|heif)$/i;

/**
 * Photo uploader + gallery.
 *
 * Uploads go directly from the browser to Supabase Storage. After success we
 * call a server action to register the photo in the database. RLS + bucket
 * policies do the access control.
 */
export default function GroupPhotos({
  groupId,
  members,
  initialPhotos,
  currentUserId,
  publicUrlBase,
}: Props) {
  const [photos, setPhotos] = useState<GroupPhoto[]>(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const memberById = useMemo(
    () => new Map(members.map((m) => [m.user_id, m])),
    [members]
  );

  // Realtime: subscribe to photo_events for this group.
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let isCancelled = false;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (isCancelled) return;
      if (session?.access_token) await supabase.realtime.setAuth(session.access_token);

      channel = supabase
        .channel(`group-${groupId}-photos`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "photo_events", filter: `group_id=eq.${groupId}` },
          (payload) => {
            const p = payload.new as GroupPhoto;
            setPhotos((prev) => (prev.some((x) => x.id === p.id) ? prev : [p, ...prev]));
          }
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "photo_events" },
          (payload) => {
            const p = payload.old as GroupPhoto;
            setPhotos((prev) => prev.filter((x) => x.id !== p.id));
          }
        )
        .subscribe();
    })();

    return () => {
      isCancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [groupId]);

  const handleFileSelect = async (file: File) => {
    setError(null);

    if (!SUPPORTED_MIME.test(file.type)) {
      setError("Please pick a JPG, PNG, WebP, GIF, or HEIC image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be smaller than 10 MB.");
      return;
    }

    setUploading(true);
    setProgress("Uploading...");

    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const filename = `${crypto.randomUUID()}.${ext}`;
      const path = `${currentUserId}/${groupId}/${filename}`;

      // Upload directly to Supabase Storage from the browser.
      const { error: uploadError } = await supabase.storage
        .from("group-photos")
        .upload(path, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      // Try to detect dimensions for nicer rendering.
      let width: number | null = null;
      let height: number | null = null;
      try {
        const dims = await readImageSize(file);
        width = dims.width;
        height = dims.height;
      } catch {
        // Best effort; not critical.
      }

      // Register in the database via server action.
      startTransition(async () => {
        const { error: regError } = await registerPhoto({
          groupId,
          storagePath: path,
          mimeType: file.type,
          width,
          height,
        });
        if (regError) {
          setError(regError);
        }
        setProgress(null);
        setUploading(false);
      });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Upload failed.");
      setUploading(false);
      setProgress(null);
    }
  };

  const handleDelete = (photoId: string) => {
    if (!confirm("Delete this photo?")) return;
    startTransition(async () => {
      await deletePhoto(photoId);
    });
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Photos</h2>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="text-xs font-medium px-3 py-1.5 rounded-full bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {uploading ? progress ?? "Uploading..." : "+ Add photo"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file);
            // Reset so picking the same file again still triggers change.
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <div className="px-5 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40">
          {error}
        </div>
      )}

      <div className="p-4">
        {photos.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-8">
            No photos yet. Add the first one.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.map((p) => {
              const author = memberById.get(p.user_id);
              const isMe = p.user_id === currentUserId;
              const url = `${publicUrlBase}/${p.storage_path}`;
              return (
                <div key={p.id} className="relative group rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={p.caption ?? "Group photo"}
                    className="w-full aspect-square object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 to-transparent flex items-end justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {author?.avatar_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={author.avatar_url}
                          alt=""
                          className="w-5 h-5 rounded-full flex-shrink-0 ring-1 ring-white"
                        />
                      )}
                      <span className="text-xs text-white truncate">
                        {isMe ? "You" : author?.display_name ?? "Member"}
                      </span>
                    </div>
                    {isMe && (
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="text-xs text-white/80 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Delete photo"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Read an image's natural width/height by loading it into a hidden Image object.
 */
function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const out = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(out);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read image"));
    };
    img.src = url;
  });
}
