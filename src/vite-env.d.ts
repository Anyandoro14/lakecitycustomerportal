/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Legacy alias; client falls back to this if PUBLISHABLE_KEY is unset */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SCHEDULED_MAINTENANCE?: string;
  readonly VITE_DEFAULT_TENANT_SLUG?: string;
}
