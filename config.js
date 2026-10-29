// Paste your Supabase values here (Project Settings → API).
// The anon key is SAFE to publish on GitHub — it is designed to be public.
// Your data is protected by Row Level Security (see supabase/schema.sql),
// NEVER put the "service_role" key in this file.
window.APP_CONFIG = {
  SUPABASE_URL: "https://aufgeghplcayualexjle.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1ZmdlZ2hwbGNheXVhbGV4amxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyNzYyNzEsImV4cCI6MjEwODg1MjI3MX0.1Xsr8e6MFcsZoahznV0RZXkKq-WVuRCEX4Elepnaa5w",
  BUCKET: "documents",
  MAX_FILE_BYTES: 1024 * 1024 * 1024, // 1 GB per file
  QUOTA_BYTES: 1024 * 1024 * 1024,    // storage meter shown in the sidebar (1 GB)
  DEFAULT_CATEGORIES: ["Guitar Notes", "Music Theory", "Chord Charts", "Lyrics", "Other"]
};
