import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getTenantSlug } from "@/lib/tenant";

interface TenantConfig {
  tenantId: string;
  slug: string;
  displayName: string;
  logoUrl: string | null;
  primaryColor: string;
  supportEmail: string | null;
  paymentGateway: 'manual' | 'kuva';
  crmProvider: 'internal' | 'odoo';
}

interface TenantContextValue {
  tenantId: string | null;
  config: TenantConfig | null;
  loading: boolean;
  error: string | null;
}

const TenantContext = createContext<TenantContextValue>({
  tenantId: null,
  config: null,
  loading: true,
  error: null,
});

export const useTenant = () => useContext(TenantContext);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<TenantConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const slug = getTenantSlug();

    supabase
      .from("tenants")
      .select("id, slug, display_name, logo_url, primary_color, support_email, payment_gateway, crm_provider")
      .eq("slug", slug)
      .eq("is_active", true)
      .single()
      .then(({ data, error: queryError }) => {
        if (queryError || !data) {
          console.error("Tenant lookup failed:", queryError?.message);
          setError(`Tenant "${slug}" not found`);
          setLoading(false);
          return;
        }

        setConfig({
          tenantId: data.id,
          slug: data.slug,
          displayName: data.display_name,
          logoUrl: data.logo_url,
          primaryColor: data.primary_color || '#1a1a2e',
          supportEmail: data.support_email,
          paymentGateway: data.payment_gateway as 'manual' | 'kuva',
          crmProvider: data.crm_provider as 'internal' | 'odoo',
        });
        setLoading(false);
      })
      .catch((err) => {
        console.error("Tenant lookup failed:", err);
        setError("Could not load organization. Check your connection and try again.");
        setLoading(false);
      });
  }, []);

  return (
    <TenantContext.Provider value={{ tenantId: config?.tenantId ?? null, config, loading, error }}>
      {children}
    </TenantContext.Provider>
  );
}
