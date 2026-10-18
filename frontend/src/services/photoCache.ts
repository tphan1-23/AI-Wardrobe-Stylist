// Photos live in a private bucket and are shown through signed links that change on every
// load (`...?token=abc`). The picture behind them does not change, so the cache key drops the
// query string: a photo seen before is read from the phone instead of downloaded again.
export function photoCacheKey(url: string): string {
  const query = url.indexOf("?");
  return query === -1 ? url : url.slice(0, query);
}

// Photos are resized to this width before upload (the AI reads them fine and they load faster).
export const MAX_PHOTO_WIDTH = 1024;

// The width to resize to, or null when the photo is already small enough (never scale up).
export function resizeWidth(width: number): number | null {
  return width > MAX_PHOTO_WIDTH ? MAX_PHOTO_WIDTH : null;
}
