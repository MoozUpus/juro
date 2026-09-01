const buildPath = /^\/internal\/legal-corpus\/(?:search-index-build\/(?:advance|reconcile|finalize)|source-snapshot-build\/(?:start|advance|reconcile|finalize|dry-run))$/u;

type Env = { LEGAL_CORPUS_BUILD_SERVICE: Fetcher };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || !buildPath.test(url.pathname)) {
      return Response.json({ code: "NOT_FOUND" }, { status: 404 });
    }
    return env.LEGAL_CORPUS_BUILD_SERVICE.fetch(new Request(
      `https://legal-corpus.internal${url.pathname}`,
      request,
    ));
  },
} satisfies ExportedHandler<Env>;
