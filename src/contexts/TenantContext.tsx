import { createContext, useContext, ReactNode } from "react";

/**
 * Placeholder TenantContext — multi-tenant DB tables are not yet deployed.
 * The app currently operates as a single-tenant (Lake City) instance.
 * This context is kept so existing imports compile; it returns hardcoded
 * Lake City defaults until the tenants table is in production.
 *
 * This provider is synchronous (no fetch on mount) and never blocks the tree on loading.
 */

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

const DEFAULT_CONFIG: TenantConfig = {
  tenantId: "lakecity",
  slug: "lakecity",
  displayName: "Lake City",
  logoUrl: null,
  primaryColor: "#1a1a2e",
  supportEmail: null,
  paymentGateway: "manual",
  crmProvider: "internal",
};

const TenantContext = createContext<TenantContextValue>({
  tenantId: DEFAULT_CONFIG.tenantId,
  config: DEFAULT_CONFIG,
  loading: false,
  error: null,
});

export const useTenant = () => useContext(TenantContext);

export function TenantProvider({ children }: { children: ReactNode }) {
  return (
    <TenantContext.Provider
      value={{
        tenantId: DEFAULT_CONFIG.tenantId,
        config: DEFAULT_CONFIG,
        loading: false,
        error: null,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}
