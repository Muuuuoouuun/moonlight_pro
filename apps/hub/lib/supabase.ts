import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Prefer the newer publishable key, but keep anon JWT support for compatibility.
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("Missing required Supabase environment variable: NEXT_PUBLIC_SUPABASE_URL");
}

if (!supabaseKey) {
  throw new Error(
    "Missing required Supabase environment variable: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY",
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);
