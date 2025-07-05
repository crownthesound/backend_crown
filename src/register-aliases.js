// This file is used to register module aliases for TypeScript path mappings
// It should be imported at the very beginning of the application entry point

const path = require("path");
const moduleAlias = require("module-alias");

// Register aliases for both development and production environments
// In production, we need to point to the compiled JavaScript in the dist folder
// In development, we can point directly to the TypeScript source
const isProduction = process.env.NODE_ENV === "production";

// Register the base alias for both environments
moduleAlias.addAliases({
  "@": isProduction ? path.join(__dirname, "..") : path.join(__dirname),
});

console.log(
  `Module aliases registered (${
    isProduction ? "production" : "development"
  } mode)`
);
console.log(
  `@ -> ${isProduction ? path.join(__dirname, "..") : path.join(__dirname)}`
);
