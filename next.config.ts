import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  devIndicators: false,
  outputFileTracingIncludes: { "/*": ["./supabase/migrations/**/*"] },
};

export default nextConfig;
