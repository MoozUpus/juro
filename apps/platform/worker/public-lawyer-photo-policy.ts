const publicLawyerPhotoPath =
  /^\/api\/public\/lawyers\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/photo\/?$/iu;

const allowedWidths = new Set([64, 128, 160, 288, 320]);

export type PublicLawyerPhotoVariant = {
  format: "image/webp";
  quality: number;
  width: number;
};

export function isPublicLawyerPhotoUrl(url: URL): boolean {
  return publicLawyerPhotoPath.test(url.pathname);
}

/**
 * Keep the public image transformer deliberately small and non-arbitrary.
 * The fixed variants cover catalogue and profile display sizes at 1x/2x while
 * preventing an unbounded public image-transformation surface.
 */
export function publicLawyerPhotoVariant(url: URL): PublicLawyerPhotoVariant | null {
  if (!isPublicLawyerPhotoUrl(url)) return null;
  const width = Number(url.searchParams.get("width"));
  if (!Number.isInteger(width) || !allowedWidths.has(width)) return null;
  if (url.searchParams.get("format") !== "webp") return null;
  return { format: "image/webp", quality: 80, width };
}

export function applyPublicLawyerPhotoCache(headers: Headers): Headers {
  const result = new Headers(headers);
  result.set(
    "Cache-Control",
    "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
  );
  result.delete("Pragma");
  return result;
}
