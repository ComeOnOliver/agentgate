import type { Context, Hono } from "hono";
import type { HandlerDeps } from "./common.js";
import { handleRequest } from "./common.js";

/**
 * Creates a Hono request handler for AgentGate routes.
 * Mount it with: `app.route('/agent', createHonoMiddleware(deps))`
 */
export function createHonoMiddleware(deps: HandlerDeps): (app: Hono) => Hono {
	return (app: Hono) => {
		app.all("/*", async (c: Context) => {
			const body = ["POST", "PUT", "PATCH"].includes(c.req.method)
				? await c.req.json().catch(() => undefined)
				: undefined;

			const gateReq = {
				method: c.req.method,
				path: new URL(c.req.url).pathname.replace(/^\/+/, "/"),
				body,
				headers: Object.fromEntries(c.req.raw.headers.entries()),
			};

			const gateRes = await handleRequest(gateReq, deps);

			for (const [key, value] of Object.entries(gateRes.headers)) {
				c.header(key, value);
			}

			return c.json(gateRes.body as object, gateRes.status as 200);
		});

		return app;
	};
}
