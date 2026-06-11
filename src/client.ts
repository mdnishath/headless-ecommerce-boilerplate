import { z } from "zod";
import { clientConfigSchema, type ClientConfig } from "@core/config/schema";
import { clientConfig as rawConfig } from "@client/client.config";

/**
 * The single bridge between core and the active client.
 * `@client` resolves to src/clients/<CLIENT> at build time (next.config.ts).
 * The zod parse below throws on an invalid config as soon as any module
 * imports activeClient — wired into the app pages from Task 6 onward, and
 * exercised for non-default clients by `npm run verify:client-alias`.
 */
const result = clientConfigSchema.safeParse(rawConfig);
if (!result.success) {
  throw new Error(
    `Invalid client config in src/clients/${process.env.CLIENT ?? "_default"}/client.config.ts:\n` +
      z.prettifyError(result.error),
  );
}
export const activeClient: ClientConfig = result.data;
