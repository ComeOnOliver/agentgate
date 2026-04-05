import type { NextFunction, Request, Response, Router } from "express";
import type { HandlerDeps } from "./common.js";
import { handleRequest } from "./common.js";

/**
 * Creates an Express Router that handles all AgentGate routes.
 * Mount it with: `app.use('/agent', createExpressMiddleware(deps))`
 */
export function createExpressMiddleware(
	deps: HandlerDeps,
): (req: Request, res: Response, next: NextFunction) => void {
	return async (req: Request, res: Response, _next: NextFunction) => {
		const gateReq = {
			method: req.method,
			path: req.path,
			body: req.body,
			headers: req.headers as Record<string, string | undefined>,
		};

		const gateRes = await handleRequest(gateReq, deps);

		for (const [key, value] of Object.entries(gateRes.headers)) {
			res.setHeader(key, value);
		}

		res.status(gateRes.status).json(gateRes.body);
	};
}
