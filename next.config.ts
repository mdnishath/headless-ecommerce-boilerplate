import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

const activeClient = process.env.CLIENT ?? "_default";

if (!/^[A-Za-z0-9_-]+$/.test(activeClient)) {
  throw new Error(
    `Invalid CLIENT "${activeClient}" — must match [A-Za-z0-9_-]+`,
  );
}
const clientDir = path.resolve(process.cwd(), "src/clients", activeClient);
if (!fs.existsSync(clientDir)) {
  const valid = fs.readdirSync(path.resolve(process.cwd(), "src/clients"));
  throw new Error(
    `Unknown CLIENT "${activeClient}" — expected one of: ${valid.join(", ")}`,
  );
}

// NOTE: the webpack() hook below is the entire white-label mechanism. It only
// runs under webpack — do NOT switch dev/build to --turbopack without wiring
// turbopack.resolveAlias equivalently.
const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.alias["@client"] = clientDir;
    // Next feeds tsconfig "paths" into webpack at the described-resolve stage,
    // which outranks resolve.alias (raw-resolve). Remove the @client pattern
    // from the runtime resolver so the CLIENT-selected alias wins; tsc still
    // type-checks @client/* against _default via tsconfig.
    for (const plugin of config.resolve.plugins ?? []) {
      if ((plugin as { jsConfigPlugin?: boolean })?.jsConfigPlugin) {
        delete (plugin as unknown as { paths: Record<string, unknown> })
          .paths["@client/*"];
      }
    }
    return config;
  },
};

export default nextConfig;
