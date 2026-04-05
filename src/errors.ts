/** Base error class for all AgentGate errors */
export class AgentGateError extends Error {
	public readonly statusCode: number;
	public readonly code: string;

	constructor(message: string, statusCode: number, code: string) {
		super(message);
		this.name = "AgentGateError";
		this.statusCode = statusCode;
		this.code = code;
	}

	toJSON() {
		return {
			error: {
				code: this.code,
				message: this.message,
			},
		};
	}
}

/** Thrown when input validation fails */
export class ValidationError extends AgentGateError {
	public readonly details: unknown;

	constructor(message: string, details?: unknown) {
		super(message, 400, "VALIDATION_ERROR");
		this.name = "ValidationError";
		this.details = details;
	}

	toJSON() {
		return {
			error: {
				code: this.code,
				message: this.message,
				details: this.details,
			},
		};
	}
}

/** Thrown when authentication fails */
export class AuthError extends AgentGateError {
	constructor(message = "Unauthorized") {
		super(message, 401, "AUTH_ERROR");
		this.name = "AuthError";
	}
}

/** Thrown when the agent lacks required scopes */
export class ForbiddenError extends AgentGateError {
	constructor(message = "Forbidden: insufficient scopes") {
		super(message, 403, "FORBIDDEN");
		this.name = "ForbiddenError";
	}
}

/** Thrown when an action is not found */
export class NotFoundError extends AgentGateError {
	constructor(message = "Action not found") {
		super(message, 404, "NOT_FOUND");
		this.name = "NotFoundError";
	}
}

/** Thrown when rate limit is exceeded */
export class RateLimitError extends AgentGateError {
	public readonly retryAfter: number;

	constructor(retryAfter: number) {
		super("Rate limit exceeded", 429, "RATE_LIMIT_EXCEEDED");
		this.name = "RateLimitError";
		this.retryAfter = retryAfter;
	}

	toJSON() {
		return {
			error: {
				code: this.code,
				message: this.message,
				retryAfter: this.retryAfter,
			},
		};
	}
}
