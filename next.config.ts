import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep native/server-only deps out of the bundler.
  serverExternalPackages: ["mongodb", "google-auth-library"],
};

export default nextConfig;
