/**
 * Google Photos Library API helpers.
 *
 * Notes:
 *   - baseUrl values are ephemeral (~60 min). Don't store and reuse beyond that.
 *   - Append "=w1024-h768" or similar to baseUrl to control rendered size.
 *   - In Test mode (which we're in for the capstone), photoslibrary.readonly works
 *     across all of the test user's photos and albums. In Production mode (post-
 *     verification), Google restricts third-party access to app-created data only.
 */

const PHOTOS_API = "https://photoslibrary.googleapis.com/v1";

export type Album = {
  id: string;
  title: string;
  mediaItemsCount?: string;
  coverPhotoBaseUrl?: string;
};

export type PhotoItem = {
  id: string;
  baseUrl: string;
  mimeType: string;
  width?: number;
  height?: number;
  creationTime?: string;
};

/**
 * List all albums the user has access to (their own + shared with them).
 */
export async function listAlbums(accessToken: string): Promise<Album[]> {
  const albums: Album[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const url = new URL(`${PHOTOS_API}/albums`);
    url.searchParams.set("pageSize", "50");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Photos albums failed (${res.status}): ${body}`);
    }
    const data = await res.json();
    for (const a of data.albums ?? []) {
      albums.push({
        id: a.id,
        title: a.title ?? "Untitled album",
        mediaItemsCount: a.mediaItemsCount,
        coverPhotoBaseUrl: a.coverPhotoBaseUrl,
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return albums;
}

/**
 * List all media items in a given album, newest first.
 * `since` (ISO date) optionally filters to items created after that time.
 */
export async function listAlbumPhotos(
  accessToken: string,
  albumId: string,
  pageSize = 100
): Promise<PhotoItem[]> {
  const items: PhotoItem[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const res = await fetch(`${PHOTOS_API}/mediaItems:search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ albumId, pageSize, pageToken }),
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Photos search failed (${res.status}): ${body}`);
    }
    const data = await res.json();
    for (const m of data.mediaItems ?? []) {
      items.push({
        id: m.id,
        baseUrl: m.baseUrl,
        mimeType: m.mimeType,
        width: m.mediaMetadata?.width ? Number(m.mediaMetadata.width) : undefined,
        height: m.mediaMetadata?.height ? Number(m.mediaMetadata.height) : undefined,
        creationTime: m.mediaMetadata?.creationTime,
      });
    }
    pageToken = data.nextPageToken;
    // Cap pagination — for capstone we don't need to ingest 10k photos.
    if (items.length >= 200) break;
  } while (pageToken);

  return items;
}
