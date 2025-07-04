// This file is used to register path aliases for production use
const tsConfigPaths = require("tsconfig-paths");
const path = require("path");
const fs = require("fs");

// Read tsconfig.json
const tsConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../tsconfig.json"), "utf-8")
);
const baseUrl = path.join(__dirname, "../", tsConfig.compilerOptions.baseUrl);

// Register path aliases
tsConfigPaths.register({
  baseUrl,
  paths: tsConfig.compilerOptions.paths,
});

console.log("✅ TypeScript path aliases registered for production use");
