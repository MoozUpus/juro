/** Node-only validation shim for Cloudflare's runtime-provided module. */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return {
      url: "data:text/javascript,export const env = {}; export class WorkerEntrypoint {}; export class DurableObject {}; export class WorkflowEntrypoint {};",
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
