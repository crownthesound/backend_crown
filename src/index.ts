// Load environment variables first
import * as dotenv from "dotenv";
dotenv.config();
console.log("Environment variables loaded");

// Register module aliases
require("./register-aliases");

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import rateLimit from "express-rate-limit";
import path from "path";

import { errorHandler } from "./middleware/errorHandler";
import { notFoundHandler } from "./middleware/notFoundHandler";
import { authMiddleware } from "./middleware/authMiddleware";
import { logger } from "./utils/logger";
import { validateEnv } from "./config/env";

// Routes
import authRoutes from "./routes/auth";
import tiktokRoutes from "./routes/tiktok";
import contestRoutes from "./routes/contests";
import { tiktokController } from "./controllers/tiktokController";

// Validate environment variables
validateEnv();

const app = express();
const PORT = process.env["PORT"] || 3001;

// Trust proxy for Cloudflare tunnel and other proxies
app.set("trust proxy", true);

// Security middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// CORS configuration - use a more permissive setup for development
app.use(
  cors({
    origin: "*", // Allow all origins in development
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-api-key",
      "Accept",
      "Cache-Control",
    ],
  })
);

// Add a middleware to log all incoming requests
app.use((req, res, next) => {
  logger.info(
    `${req.method} ${req.url} - Origin: ${
      req.headers.origin || "none"
    } - Referer: ${req.headers.referer || "none"}`
  );
  next();
});

// Rate limiting - more permissive for development with proper proxy handling
const limiter = rateLimit({
  windowMs: parseInt(process.env["RATE_LIMIT_WINDOW_MS"] || "900000"), // 15 minutes
  // Allow higher throughput by default – can still be overridden with env vars
  max: parseInt(process.env["RATE_LIMIT_MAX_REQUESTS"] || "5000"),
  message: {
    error: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use a combination of IP and headers for better identification behind proxies
  keyGenerator: (req) => {
    return (
      req.ip +
      ":" +
      (req.headers["x-forwarded-for"] ||
        req.headers["cf-connecting-ip"] ||
        "unknown")
    );
  },
  // Skip rate limiting for:
  // 1. Requests carrying a valid internal API key (used by cron / edge functions)
  // 2. Read-only leaderboard endpoints (high read volume, low risk)
  // 3. TikTok auth endpoints when running locally
  skip: (req) => {
    const bypassKey = process.env["RATE_LIMIT_BYPASS_KEY"];
    if (bypassKey && req.headers["x-api-key"] === bypassKey) {
      return true;
    }

    if (req.method === "GET" && req.url.includes("/leaderboard")) {
      return true;
    }

    return (
      process.env.NODE_ENV === "development" && req.url.includes("/tiktok/")
    );
  },
});
app.use("/api/", limiter);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Compression middleware
app.use(compression());

// Logging middleware
app.use(
  morgan("combined", {
    stream: {
      write: (message: string) => logger.info(message.trim()),
    },
  })
);

// Serve static files (for testing TikTok integration)
app.use(express.static(path.join(__dirname, "../public")));

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env["NODE_ENV"],
    version: process.env["npm_package_version"] || "1.0.0",
  });
});

// Debug route to list all registered routes
app.get("/debug/routes", (req, res) => {
  const routes: { path: string; methods: string[] }[] = [];

  // Function to extract routes from a router
  function extractRoutes(router: any, basePath: string = "") {
    if (!router.stack) return;

    router.stack.forEach((layer: any) => {
      if (layer.route) {
        // This is a route
        const path = basePath + (layer.route.path || "");
        const methods = Object.keys(layer.route.methods).map((m) =>
          m.toUpperCase()
        );
        routes.push({ path, methods });
      } else if (layer.name === "router" && layer.handle.stack) {
        // This is a nested router
        const path =
          basePath +
          (layer.regexp.source
            .replace("^\\/", "")
            .replace("\\/?(?=\\/|$)", "") || "");
        extractRoutes(layer.handle, path);
      } else if (layer.name === "bound dispatch" && layer.handle.stack) {
        // This is a mounted app or router
        const path =
          basePath +
          (layer.regexp.source
            .replace("^\\/", "")
            .replace("\\/?(?=\\/|$)", "") || "");
        extractRoutes(layer.handle, path);
      }
    });
  }

  // Extract routes from the main app
  extractRoutes(app._router);

  // Log all routes for debugging
  logger.info("🔍 All registered routes:");
  routes.forEach((route) => {
    logger.info(`${route.methods.join(", ")} ${route.path}`);
  });

  // Return the routes as JSON
  res.json({
    count: routes.length,
    routes: routes.sort((a, b) => a.path.localeCompare(b.path)),
  });
});

// Handle preflight requests for all API routes
app.options("/api/*", cors());

// API routes
const apiVersion = process.env["API_VERSION"] || "v1";
app.use(`/api/${apiVersion}/auth`, authRoutes);
app.use(`/api/${apiVersion}/tiktok`, tiktokRoutes);
app.use(`/api/${apiVersion}/contests`, contestRoutes);

// Direct routes for TikTok endpoints that are having issues
// Direct route for TikTok auth initiate
app.post(`/api/${apiVersion}/tiktok/auth/initiate`, (req, res, next) => {
  logger.info("🔍 Direct route for TikTok auth/initiate hit");
  return tiktokController.initiateAuth(req, res, next);
});

// Direct route for TikTok profile disconnect
app.post(
  `/api/${apiVersion}/tiktok/profile/disconnect`,
  authMiddleware,
  (req, res, next) => {
    logger.info("🔍 Direct route for TikTok profile/disconnect hit");
    return tiktokController.disconnectTikTokProfile(req, res, next);
  }
);

// Alternative redirect URI routes for testing
app.get("/api/v1/auth/tiktok/callback", (req, res) => {
  logger.info("Alternative redirect URI #1 hit: /api/v1/auth/tiktok/callback");
  res.redirect(
    `/api/v1/tiktok/auth/callback${
      req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : ""
    }`
  );
});

app.get("/tiktok/callback", (req, res) => {
  logger.info("Alternative redirect URI #2 hit: /tiktok/callback");
  res.redirect(
    `/api/v1/tiktok/auth/callback${
      req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : ""
    }`
  );
});

app.get("/callback", (req, res) => {
  logger.info("Alternative redirect URI #3 hit: /callback");
  res.redirect(
    `/api/v1/tiktok/auth/callback${
      req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : ""
    }`
  );
});

// Base URL redirect for testing
app.get("/", (req, res) => {
  if (req.query.code && req.query.state) {
    logger.info("Base URL redirect hit with code and state");
    res.redirect(
      `/api/v1/tiktok/auth/callback${
        req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : ""
      }`
    );
  } else {
    // If no code and state, just serve the index.html file
    res.sendFile(path.join(__dirname, "../public/index.html"));
  }
});

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📱 Environment: ${process.env["NODE_ENV"]}`);
  logger.info(`🌐 API Version: ${apiVersion}`);
  logger.info(`🔗 Health check: http://localhost:${PORT}/health`);
});

export default app;
