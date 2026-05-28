const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");
const sharedRoot = path.resolve(monorepoRoot, "packages/shared");

const config = getDefaultConfig(projectRoot);

// Только shared — не весь monorepo (proxy/git/IDE не должны триггерить rebundle)
config.watchFolders = [sharedRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Metro пишет в .expo/ при каждом bundle — без ignore → бесконечный rebundle
config.watcher = {
  ...config.watcher,
  healthCheck: {
    enabled: false,
  },
};

module.exports = config;
