import type { NextConfig } from "next";

/**
 * The app root is pinned to this folder. Without it, Next.js infers the workspace
 * root from the nearest lockfile, and in a nested checkout (for example a git
 * worktree under .claude/worktrees/) it picks the parent repo's lockfile and
 * resolves/traces files from the wrong directory.
 * See node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/turbopack.md
 * ("Root directory") and output.md (outputFileTracingRoot).
 */
const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
