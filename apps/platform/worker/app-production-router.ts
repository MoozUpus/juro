type Environment = {
  PLATFORM: Fetcher;
};

/**
 * Keeps the public app.juro.uz hostname attached to the production JURO
 * service environment without duplicating any secret or data binding.
 */
const productionRouter = {
  fetch(request: Request, env: Environment): Promise<Response> {
    return env.PLATFORM.fetch(request);
  },
};

export default productionRouter;
