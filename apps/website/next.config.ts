import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep SEO metadata in the initial <head>. The public site is consumed by
  // browsers, audit tools, and crawlers that do not all wait for React to move
  // streamed metadata out of the response body.
  htmlLimitedBots: /.*/,
};

export default nextConfig;
