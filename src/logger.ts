export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

export interface LogEntry {
	level: LogLevel;
	message: string;
	timestamp: string;
	[key: string]: unknown;
}

export class Logger {
	private level: LogLevel;
	private enabled: boolean;

	constructor(level: LogLevel = "info", enabled = true) {
		this.level = level;
		this.enabled = enabled;
	}

	private shouldLog(level: LogLevel): boolean {
		return this.enabled && LOG_LEVELS[level] >= LOG_LEVELS[this.level];
	}

	private write(level: LogLevel, message: string, data?: Record<string, unknown>): void {
		if (!this.shouldLog(level)) return;

		const entry: LogEntry = {
			level,
			message,
			timestamp: new Date().toISOString(),
			...data,
		};

		const output = JSON.stringify(entry);

		if (level === "error") {
			process.stderr.write(`${output}\n`);
		} else {
			process.stdout.write(`${output}\n`);
		}
	}

	debug(message: string, data?: Record<string, unknown>): void {
		this.write("debug", message, data);
	}

	info(message: string, data?: Record<string, unknown>): void {
		this.write("info", message, data);
	}

	warn(message: string, data?: Record<string, unknown>): void {
		this.write("warn", message, data);
	}

	error(message: string, data?: Record<string, unknown>): void {
		this.write("error", message, data);
	}
}
