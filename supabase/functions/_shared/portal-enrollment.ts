// Edge functions in this repo pin different @supabase/supabase-js versions
// (2, 2.47.10, 2.49.4). Each esm.sh version is a distinct module, so the named
// SupabaseClient type from one is not assignable to another's. Keep this loose:
// a structural query-builder shape makes Deno's type checker recurse too deep.
export type PortalEnrollmentClient = {
  from: (...args: any[]) => any;
};

export const PORTAL_NOT_ENROLLED_MESSAGE =
  "This stand is not yet enrolled on the Customer Portal. Please contact LakeCity.";

export function normalizeStandNumber(stand: string): string {
  return (stand ?? "").toString().trim().toUpperCase();
}

/** Default tenant when JWT / request does not carry tenant_id (Lakecity production). */
export async function resolveDefaultTenantId(
  supabase: PortalEnrollmentClient,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", "lakecity")
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    console.warn("resolveDefaultTenantId:", error.message);
    return null;
  }
  return data?.id ?? null;
}

export async function resolveTenantId(
  supabase: PortalEnrollmentClient,
  tenantId?: string | null,
): Promise<string | null> {
  if (tenantId) return tenantId;
  return resolveDefaultTenantId(supabase);
}

export type PortalEnrollmentResult =
  | { enrolled: true }
  | { enrolled: false; message: string };

export async function checkStandPortalEnrolled(
  supabase: PortalEnrollmentClient,
  tenantId: string | null | undefined,
  standNumber: string,
): Promise<PortalEnrollmentResult> {
  const stand = normalizeStandNumber(standNumber);
  if (!stand) {
    return { enrolled: false, message: PORTAL_NOT_ENROLLED_MESSAGE };
  }

  const tid = await resolveTenantId(supabase, tenantId);
  if (!tid) {
    console.warn("checkStandPortalEnrolled: no tenant_id; denying stand", stand);
    return { enrolled: false, message: PORTAL_NOT_ENROLLED_MESSAGE };
  }

  const { data, error } = await supabase
    .from("stand_portal_settings")
    .select("portal_enrolled")
    .eq("tenant_id", tid)
    .eq("stand_number", stand)
    .maybeSingle();

  if (error) {
    console.error("stand_portal_settings lookup failed:", error.message);
    return { enrolled: false, message: PORTAL_NOT_ENROLLED_MESSAGE };
  }

  if (!data?.portal_enrolled) {
    return { enrolled: false, message: PORTAL_NOT_ENROLLED_MESSAGE };
  }

  return { enrolled: true };
}
