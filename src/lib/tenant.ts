export const getTenantSlug = (): string => {
  // Optional override for local dev (e.g. multi-tenant testing) — set in .env:
  // VITE_DEFAULT_TENANT_SLUG=lakecity
  const fromEnv = import.meta.env.VITE_DEFAULT_TENANT_SLUG;
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.trim().toLowerCase();
  }

  const hostname = window.location.hostname;

  // Local development: default tenant slug (must match a row in public.tenants)
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "lakecity";
  }

  // Subdomain-based routing: lakecity.yourdomain.com → 'lakecity'
  const subdomain = hostname.split(".")[0].toLowerCase();

  // www / app / staging hosts are not tenant slugs — use canonical tenant
  const reserved = new Set(["www", "app", "staging", "preview"]);
  if (reserved.has(subdomain)) {
    return "lakecity";
  }

  return subdomain;
};
