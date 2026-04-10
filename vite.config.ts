import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const supabaseUrl =
    env.VITE_SUPABASE_URL?.trim() ||
    env.SUPABASE_URL?.trim() ||
    "https://gumkxjeahojrcaqnosyz.supabase.co";

  const supabasePublishableKey =
    env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    env.VITE_SUPABASE_ANON_KEY?.trim() ||
    env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    env.SUPABASE_ANON_KEY?.trim() ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1bWt4amVhaG9qcmNhcW5vc3l6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MzY3MTQsImV4cCI6MjA3OTAxMjcxNH0.spro1gfxCP6JKUETHrXzjGUMC7D7ge0CQ0HXP7VLrOs";

  const defaultTenantSlug = env.VITE_DEFAULT_TENANT_SLUG?.trim() || "lakecity";

  return {
    server: {
      host: "::",
      port: 8080,
    },
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabasePublishableKey),
      "import.meta.env.VITE_DEFAULT_TENANT_SLUG": JSON.stringify(defaultTenantSlug),
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: "script-defer", // Defer SW registration to avoid render-blocking
        includeAssets: ["favicon.ico", "lakecity-logo.svg", "icons/*.png"],
        manifest: false, // Using our custom manifest.json
        workbox: {
          // After each deploy, take control immediately and drop old precaches. Without this,
          // users can keep a stale SW that serves an old index.html → hashed chunk URLs404 → blank SPA.
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts-cache",
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                },
              },
            },
          ],
        },
      }),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
