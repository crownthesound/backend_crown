// Register module aliases
import "module-alias/register";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import rateLimit from "express-rate-limit";
import path from "path";

import { errorHandler } from "@/middleware/errorHandler";
import { notFoundHandler } from "@/middleware/notFoundHandler";
import { authMiddleware } from "@/middleware/authMiddleware";
import { logger } from "@/utils/logger";
import { validateEnv } from "@/config/env";

// Routes
import authRoutes from "@/routes/auth";
import tiktokRoutes from "@/routes/tiktok";
import contestRoutes from "@/routes/contests";

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
  max: parseInt(process.env["RATE_LIMIT_MAX_REQUESTS"] || "1000"), // Increased limit
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
  // Skip rate limiting for TikTok auth endpoints in development
  skip: (req) => {
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

// Handle preflight requests for all API routes
app.options("/api/*", cors());

// API routes
const apiVersion = process.env["API_VERSION"] || "v1";
app.use(`/api/${apiVersion}/auth`, authRoutes);
app.use(`/api/${apiVersion}/tiktok`, tiktokRoutes);
app.use(`/api/${apiVersion}/contests`, contestRoutes);

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
