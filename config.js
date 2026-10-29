// Paste your Supabase values here (Project Settings → API).
// The anon key is SAFE to publish on GitHub — it is designed to be public.
// Your data is protected by Row Level Security (see supabase/schema.sql),
// NEVER put the "service_role" key in this file.
window.APP_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-PUBLIC-KEY",
  BUCKET: "documents",
  MAX_FILE_BYTES: 1024 * 1024 * 1024, // 1 GB per file
  QUOTA_BYTES: 1024 * 1024 * 1024,    // storage meter shown in the sidebar (1 GB)
  DEFAULT_CATEGORIES: ["Guitar Notes", "Music Theory", "Chord Charts", "Lyrics", "Other"]
};
