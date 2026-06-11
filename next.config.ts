import path from "node:path";
import type { NextConfig } from "next";

const activeClient = process.env.CLIENT ?? "_default";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.alias["@client"] = path.resolve(
      process.cwd(),
      "src/clients",
      activeClient,
    );
    return config;
  },
};

export default nextConfig;
