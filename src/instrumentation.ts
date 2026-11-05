import type { Instrumentation } from "next";

/** Unhandled errors in server components, actions and routes go to error monitoring, redacted. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  // The literal check lets the bundler drop the Node-only logger from the edge build.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { reportError } = await import("@/server/log");
    await reportError("next.request", err, {
      path: request.path.split("?")[0],
      kind: context.routeType,
      route: context.routePath,
    });
  }
};
