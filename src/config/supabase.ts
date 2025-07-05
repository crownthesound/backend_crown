import { createClient } from "@supabase/supabase-js";
import { config } from "./env";
import type { Database } from "@/types/database";

// Create Supabase client with anon key (for public operations)
console.log(config.supabase);
export const supabase = createClient<Database>(
  config.supabase.url || "https://placeholder.supabase.co",
  config.supabase.anonKey || "placeholder-anon-key",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        "x-application-name": "crown-backend",
      },
    },
  }
);
// Create Supabase admin client with service role key (for admin operations)
export const supabaseAdmin = createClient<Database>(
  config.supabase.url || "https://placeholder.supabase.co",
  config.supabase.serviceRoleKey || "placeholder-service-role-key",
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
