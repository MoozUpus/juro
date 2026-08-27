import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyPublicLawyerPhotoCache,
  isPublicLawyerPhotoUrl,
  publicLawyerPhotoVariant,
} from "../worker/public-lawyer-photo-policy";

const profileId = "fbd3f7bd-c95a-4621-a031-118fffaba9ef";

test("public lawyer photos expose only bounded WebP variants", () => {
  const url = new URL(
    `https://app.juro.uz/api/public/lawyers/${profileId}/photo?width=128&format=webp`,
  );
  assert.equal(isPublicLawyerPhotoUrl(url), true);
  assert.deepEqual(publicLawyerPhotoVariant(url), {
    format: "image/webp",
    quality: 80,
    width: 128,
  });

  for (const width of [1, 127, 129, 1024, 999999]) {
    const rejected = new URL(url);
    rejected.searchParams.set("width", String(width));
    assert.equal(publicLawyerPhotoVariant(rejected), null);
  }
  const arbitraryFormat = new URL(url);
  arbitraryFormat.searchParams.set("format", "png");
  assert.equal(publicLawyerPhotoVariant(arbitraryFormat), null);
});

test("photo policy never matches private or malformed routes", () => {
  assert.equal(
    isPublicLawyerPhotoUrl(new URL("https://app.juro.uz/api/platform/lawyer-profile/photo")),
    false,
  );
  assert.equal(
    isPublicLawyerPhotoUrl(new URL("https://app.juro.uz/api/public/lawyers/not-a-uuid/photo")),
    false,
  );
});

test("approved public photos are cacheable without retaining private directives", () => {
  const headers = applyPublicLawyerPhotoCache(new Headers({
    "cache-control": "private, no-store, max-age=0",
    pragma: "no-cache",
  }));
  assert.equal(
    headers.get("cache-control"),
    "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
  );
  assert.equal(headers.has("pragma"), false);
});

test("the Worker applies the public photo policy before its generic private fallback", () => {
  const worker = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
  const wrangler = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  assert.match(worker, /publicLawyerPhotoVariant\(routedUrl\)/u);
  assert.match(worker, /env\.IMAGES[\s\S]*?\.transform\(\{ width: photoVariant\.width \}\)/u);
  assert.match(worker, /isCacheablePublicLawyerPhoto[\s\S]*?response\.ok \|\| response\.status === 304/u);
  assert.match(worker, /public_lawyer_photo_transform_failed/u);
  assert.match(wrangler, /"production"[\s\S]*?"cache"\s*:\s*\{\s*"enabled"\s*:\s*true/u);
  assert.ok(
    worker.indexOf("else if (isCacheablePublicLawyerPhoto)")
      < worker.indexOf("else if (isPrivateApi || isPrivateShare"),
  );
});
