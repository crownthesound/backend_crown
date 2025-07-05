import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// DEVELOPMENT ONLY: Hardcoded values for local development
const DEV_SUPABASE_URL = "https://mhflahfkeqxsolneaoxy.supabase.co";
const DEV_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oZmxhaGZrZXF4c29sbmVhb3h5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM5MDg0NjIsImV4cCI6MjA1OTQ4NDQ2Mn0.TKLy609teZ2sZ5spCvKx8W9tsir5uXLXd-c9epe0znA";
const DEV_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oZmxhaGZrZXF4c29sbmVhb3h5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTY4ODQ3MTY5MSwiZXhwIjoyMDA0MDQ3NjkxfQ.jLRJ--0-iU1ZlXmRJ3-Z3_xGCUjAQBIVHg8vdJDPMXA";

// Determine if we're in development mode
const isDevelopment =
  process.env.NODE_ENV === "development" || !process.env.NODE_ENV;

// Get the actual values to use - prefer env vars, fall back to hardcoded dev values
const supabaseUrl =
  process.env.SUPABASE_URL || (isDevelopment ? DEV_SUPABASE_URL : "");
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY || (isDevelopment ? DEV_SUPABASE_ANON_KEY : "");
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  (isDevelopment ? DEV_SERVICE_ROLE_KEY : "");

// Log the configuration
console.log("🔍 Environment:", isDevelopment ? "DEVELOPMENT" : "PRODUCTION");
console.log("🔍 Supabase URL:", supabaseUrl || "NOT SET");
console.log("🔍 Supabase Anon Key:", supabaseAnonKey ? "SET" : "NOT SET");
console.log("🔍 Supabase Service Key:", supabaseServiceKey ? "SET" : "NOT SET");

// Create Supabase client with anon key (for public operations)
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  global: {
    headers: {
      "x-application-name": "crown-backend",
    },
  },
});

// Create Supabase admin client with service role key (for admin operations)
export const supabaseAdmin = createClient<Database>(
  supabaseUrl,
  supabaseServiceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        "x-application-name": "crown-backend-admin",
      },
    },
  }
);

export default supabase;
