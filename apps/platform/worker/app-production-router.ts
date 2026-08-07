type Environment = {
  PLATFORM: Fetcher;
};

/**
 * Keeps the public app.juro.uz hostname attached to the production JURO
 * service environment without duplicating any secret or data binding.
 */
export default {
  fetch(request: Request, env: Environment): Promise<Response> {
    if (new URL(request.url).pathname === "/__juro-router-health") {
      return new Response(null, {
        status: 204,
        headers: { "X-JURO-Production-Router": "active" },
      });
    }
    return env.PLATFORM.fetch(request);
  },
};
