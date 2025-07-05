import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// Try to load environment variables from different locations
try {
  // Try to load from .env in the project root
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    console.log(`Loading environment variables from ${envPath}`);
    dotenv.config({ path: envPath });
  } else {
    // Try to load from backend/.env
    const backendEnvPath = path.resolve(process.cwd(), "backend/.env");
    if (fs.existsSync(backendEnvPath)) {
      console.log(`Loading environment variables from ${backendEnvPath}`);
      dotenv.config({ path: backendEnvPath });
    } else {
      // Fallback to default behavior
      console.log("No .env file found, using process.env as is");
      dotenv.config();
    }
  }
} catch (error) {
  console.error("Error loading .env file:", error);
  // Continue anyway, we'll use defaults
}

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
  // Debug: Log environment variables
  console.log("🐛 DEBUG ENV VARS:");
  console.log("NODE_ENV:", process.env["NODE_ENV"] || "not set");
  console.log("SUPABASE_URL:", process.env["SUPABASE_URL"] || "not set");
  console.log(
    "SUPABASE_ANON_KEY:",
    process.env["SUPABASE_ANON_KEY"] ? "set" : "not set"
  );
  console.log(
    "TIKTOK_CLIENT_KEY:",
    process.env["TIKTOK_CLIENT_KEY"] || "not set"
  );
  console.log(
    "TIKTOK_CLIENT_SECRET:",
    process.env["TIKTOK_CLIENT_SECRET"] ? "set" : "not set"
  );
  console.log(
    "TIKTOK_REDIRECT_URI:",
    process.env["TIKTOK_REDIRECT_URI"] || "not set"
  );

  // For testing purposes, we'll make all vars optional
  const requiredEnvVars: (keyof EnvConfig)[] = [];

  const missingVars = requiredEnvVars.filter(
    (varName) => !process.env[varName]
  );

  if (missingVars.length > 0) {
    console.warn(
      `Warning: Missing environment variables: ${missingVars.join(", ")}`
    );
  }
};

// DEVELOPMENT ONLY: Hardcoded values for local development
const DEV_SUPABASE_URL = "https://mhflahfkeqxsolneaoxy.supabase.co";
const DEV_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oZmxhaGZrZXF4c29sbmVhb3h5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM5MDg0NjIsImV4cCI6MjA1OTQ4NDQ2Mn0.TKLy609teZ2sZ5spCvKx8W9tsir5uXLXd-c9epe0znA";
const DEV_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oZmxhaGZrZXF4c29sbmVhb3h5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTY4ODQ3MTY5MSwiZXhwIjoyMDA0MDQ3NjkxfQ.jLRJ--0-iU1ZlXmRJ3-Z3_xGCUjAQBIVHg8vdJDPMXA";

// Determine if we're in development mode
const isDevelopment =
  process.env.NODE_ENV === "development" || !process.env.NODE_ENV;

export const config = {
  nodeEnv: process.env["NODE_ENV"] || "development",
  port: parseInt(process.env["PORT"] || "3001", 10),
  apiVersion: process.env["API_VERSION"] || "v1",
  supabase: {
    url: process.env["SUPABASE_URL"] || (isDevelopment ? DEV_SUPABASE_URL : ""),
    anonKey:
      process.env["SUPABASE_ANON_KEY"] ||
      (isDevelopment ? DEV_SUPABASE_ANON_KEY : ""),
    serviceRoleKey:
      process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
      (isDevelopment ? DEV_SERVICE_ROLE_KEY : ""),
  },
  tiktok: {
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
