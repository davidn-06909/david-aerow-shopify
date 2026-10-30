import { createRequestHandler } from "react-router";
export function createNodeHandler(build) {
  const handler = createRequestHandler(build, "production");
  return async (request, context) => {
    try { return await handler(request, context); }
    catch {
      console.error("Ring pilot Node handler failed", { path: new URL(request.url).pathname });
      return new Response("Internal error", { status: 500 });
    }
  };
}
