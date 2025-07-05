// This file must be imported before any other imports in the application
const path = require("path");
const moduleAlias = require("module-alias");

// Register module aliases for both development and production
moduleAlias.addAliases({
  "@": path.join(__dirname, "../src"), // For development with ts-node
});

// Also register the dist path for production builds
moduleAlias.addAliases({
  "@": path.join(__dirname, "../dist"), // For production with compiled JS
});

console.log("✅ Module aliases registered successfully");
