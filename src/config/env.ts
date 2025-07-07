import dotenv from "dotenv";

// Load environment variables first
dotenv.config();

interface EnvConfig {
  NODE_ENV: string;
  PORT: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  TIKTOK_CLIENT_KEY: string;
  TIKTOK_CLIENT_SECRET: string;
  TIKTOK_REDIRECT_URI: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  FRONTEND_URL: string;
}

export const validateEnv = (): void => {
  // Debug: Log TikTok environment variables
  console.log("🐛 DEBUG ENV VARS:");
  console.log("TIKTOK_CLIENT_KEY:", process.env["TIKTOK_CLIENT_KEY"]);
  console.log(
    "TIKTOK_CLIENT_SECRET:",
    process.env["TIKTOK_CLIENT_SECRET"] ? "SET" : "NOT SET"
  );
  console.log("TIKTOK_REDIRECT_URI:", process.env["TIKTOK_REDIRECT_URI"]);

  // For testing purposes, we'll make Supabase vars optional
  // In production, you should set these as required
  const requiredEnvVars: (keyof EnvConfig)[] = [];

  const missingVars = requiredEnvVars.filter(
    (varName) => !process.env[varName]
  );

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(", ")}`
    );
  }
};

// Determine which TikTok environment we should use (production by default)
const useSandbox = process.env["TIKTOK_ENV"] === "sandbox";

export const config = {
  nodeEnv: process.env["NODE_ENV"] || "development",
  port: parseInt(process.env["PORT"] || "3001", 10),
  apiVersion: process.env["API_VERSION"] || "v1",
  supabase: {
    url: process.env["SUPABASE_URL"]!,
    anonKey: process.env["SUPABASE_ANON_KEY"]!,
    serviceRoleKey: process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
  },
  tiktok: {
    // true when TIKTOK_ENV=sandbox, false otherwise
    useSandbox,
    clientKey: process.env["TIKTOK_CLIENT_KEY"] || "",
    clientSecret: process.env["TIKTOK_CLIENT_SECRET"] || "",
    redirectUri:
      process.env["TIKTOK_REDIRECT_URI"] ||
      "http://localhost:3001/api/v1/tiktok/auth/callback",
  },

  cors: {
    origin: process.env["FRONTEND_URL"]?.split(",") || [
      "http://localhost:5173",
    ],
  },
  rateLimit: {
    windowMs: parseInt(process.env["RATE_LIMIT_WINDOW_MS"] || "900000"),
    maxRequests: parseInt(process.env["RATE_LIMIT_MAX_REQUESTS"] || "100"),
  },
  logging: {
    level: process.env["LOG_LEVEL"] || "info",
    file: process.env["LOG_FILE"] || "logs/app.log",
  },
};
