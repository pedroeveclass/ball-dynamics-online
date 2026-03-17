/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_SUPABASE_PROJECT_ID?: string;
  readonly VITE_MATCH_ENGINE_FUNCTION?: string;
  readonly VITE_MATCH_ENGINE_LOCAL_FUNCTION?: string;
  readonly VITE_MATCH_ENGINE_FALLBACK_FUNCTION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
