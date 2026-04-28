"use client";

import { useState, useTransition } from "react";
import {
  disconnectGoogle,
  listMyAlbums,
  setAmbientAlbum,
  clearAmbientAlbum,
} from "./google-actions";

export type AlbumLike = {
  id: string;
  title: string;
  mediaItemsCount?: string;
  coverPhotoBaseUrl?: string;
};

type Props = {
  /** Current album setting from the database, if any. */
  current: { albumId: string; albumTitle: string | null } | null;
};

/**
 * Photo album picker. Uses server actions to talk to Google.
 *
 * If no album is set, shows a "Pick an album" button which expands into a list.
 * If an album is set, shows it with a "Change" / "Stop sharing" option.
 */
export default function AlbumPicker({ current }: Props) {
  const [albums, setAlbums] = useState<AlbumLike[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [picking, setPicking] = useState(false);

  const loadAlbums = () => {
    setPicking(true);
    setError(null);
    startTransition(async () => {
      const result = await listMyAlbums();
      if (result.error) setError(result.error);
      else setAlbums(result.albums ?? []);
    });
  };

  const choose = (album: AlbumLike) => {
    setError(null);
    startTransition(async () => {
      const result = await setAmbientAlbum(album.id, album.title);
      if (result.error) setError(result.error);
      else {
        setPicking(false);
        setAlbums(null);
      }
    });
  };

  const stopSharing = () => {
    setError(null);
    startTransition(async () => {
      await clearAmbientAlbum();
    });
  };

  const reconnect = () => {
    setError(null);
    startTransition(async () => {
      await disconnectGoogle();
      // Trigger a fresh OAuth.
      window.location.href = "/api/google/start";
    });
  };

  if (current && !picking) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Sharing photos from
        </p>
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">
          📷 {current.albumTitle ?? "Untitled album"}
        </p>
        <div className="flex gap-2 pt-1">
          <button
            onClick={loadAlbums}
            disabled={isPending}
            className="text-xs font-medium text-green-700 dark:text-green-400 hover:underline disabled:opacity-50"
          >
            Change album
          </button>
          <span className="text-xs text-zinc-300 dark:text-zinc-700">·</span>
          <button
            onClick={stopSharing}
            disabled={isPending}
            className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 hover:underline disabled:opacity-50"
          >
            Stop sharing
          </button>
        </div>
      </div>
    );
  }

  // No album yet, or picking a different one
  return (
    <div className="space-y-3">
      {!picking ? (
        <button
          onClick={loadAlbums}
          disabled={isPending}
          className="text-sm font-medium text-green-700 dark:text-green-400 hover:underline disabled:opacity-50"
        >
          {isPending ? "Loading..." : "📷 Pick an album to share"}
        </button>
      ) : (
        <>
          {isPending && !albums && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Loading your albums…</p>
          )}
          {albums && albums.length === 0 && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              No albums found. Create an album in Google Photos first, then come back.
            </p>
          )}
          {albums && albums.length > 0 && (
            <div className="space-y-1 max-h-60 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-lg p-2">
              {albums.map((album) => (
                <button
                  key={album.id}
                  onClick={() => choose(album)}
                  disabled={isPending}
                  className="w-full text-left flex items-center gap-3 p-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800/50 disabled:opacity-50"
                >
                  {album.coverPhotoBaseUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`${album.coverPhotoBaseUrl}=w64-h64-c`}
                      alt=""
                      className="w-8 h-8 rounded object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded bg-zinc-200 dark:bg-zinc-700 flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-900 dark:text-zinc-50 truncate">
                      {album.title}
                    </p>
                    {album.mediaItemsCount && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {album.mediaItemsCount} photos
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => {
              setPicking(false);
              setAlbums(null);
            }}
            className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 hover:underline"
          >
            Cancel
          </button>
        </>
      )}
      {error && (
        <div className="space-y-1">
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          {error.toLowerCase().includes("photo access") && (
            <button
              onClick={reconnect}
              className="text-xs font-medium text-green-700 dark:text-green-400 hover:underline"
            >
              Reconnect Google with photo access →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
