import {
  CUSTOM_SEARCH_PATH,
  handleCustomSearchRequest,
  type CustomSearchEnv,
} from "../lib/legal-corpus/custom-search-service";

export default {
  async fetch(request: Request, env: CustomSearchEnv): Promise<Response> {
    if (new URL(request.url).pathname !== CUSTOM_SEARCH_PATH) {
      return new Response(null, {
        status: 404,
        headers: { "cache-control": "private, no-store" },
      });
    }
    return handleCustomSearchRequest(request, env);
  },
} satisfies ExportedHandler<CustomSearchEnv>;
