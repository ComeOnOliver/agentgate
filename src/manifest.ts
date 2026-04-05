import { actionToManifest } from "./action.js";
import type { ActionRegistry } from "./action.js";
import type { GateConfig, Manifest } from "./types.js";

const PROTOCOL_VERSION = "agentgate/1.0";

/** Generate the manifest JSON from gate config and registered actions */
export function generateManifest(config: GateConfig, registry: ActionRegistry): Manifest {
	const authSchemes: string[] = [];
	let registration: string | null = null;

	if (config.auth) {
		if (config.auth.strategy === "api-key") {
			authSchemes.push("api-key");
			registration = `${config.basePath ?? ""}/register`;
		} else if (config.auth.strategy === "bearer") {
			authSchemes.push("bearer");
		}
	}

	return {
		name: config.name,
		version: config.version,
		description: config.description ?? "",
		protocol: PROTOCOL_VERSION,
		auth: {
			schemes: authSchemes,
			registration,
		},
		actions: registry.all().map(actionToManifest),
	};
}
