const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");
const sharedRoot = path.resolve(monorepoRoot, "packages/shared");

const config = getDefaultConfig(projectRoot);

// shared + корневой node_modules (pnpm .pnpm store — иначе Metro кэширует
// устаревший realpath для патченных пакетов); не весь monorepo, чтобы
// proxy/git/IDE не триггерили rebundle
config.watchFolders = [sharedRoot, path.resolve(monorepoRoot, "node_modules")];
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
