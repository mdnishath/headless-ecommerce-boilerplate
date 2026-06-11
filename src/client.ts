import { clientConfigSchema, type ClientConfig } from "@core/config/schema";
import { clientConfig as rawConfig } from "@client/client.config";

/**
 * The single bridge between core and the active client.
 * `@client` resolves to src/clients/<CLIENT> at build time (next.config.ts);
 * the zod parse fails the build on an invalid config.
 */
export const activeClient: ClientConfig = clientConfigSchema.parse(rawConfig);
