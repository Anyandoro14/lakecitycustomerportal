const env = import.meta.env;

export const config = {
  supabaseUrl: (env.VITE_SUPABASE_URL as string | undefined) ?? "",
  supabaseAnonKey: (env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? (env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "",
  /** LakeCity customer portal (StandLedger). */
  portalUrl: (env.VITE_PORTAL_URL as string | undefined) || "https://lakecity.standledger.io",
  /** DocuSign integration key is public (used by the DocuSign JS focused view); secrets stay server-side. */
  docusignIntegrationKey: (env.VITE_DOCUSIGN_INTEGRATION_KEY as string | undefined) ?? "",
  /** DEMO environment bundle only. */
  docusignJsUrl: "https://js-d.docusign.com/bundle.js",
};

export const useSupabase = Boolean(config.supabaseUrl && config.supabaseAnonKey);
