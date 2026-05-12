/** Normalise stand number for keys and uniqueness (trim + uppercase). */
export function normalizeStandNumber(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase();
}

/** Status contains "sold" → treated as officially sold (case-insensitive). */
export function isOfficiallySoldStatus(status: string | null | undefined): boolean {
  return (status ?? "").toLowerCase().includes("sold");
}

/**
 * Stands that may be offered for sale: not officially sold, and status is blank or exactly "available".
 * Any other non-sold status (e.g. reserved) is not marketable.
 */
export function isAvailableForSaleStatus(status: string | null | undefined): boolean {
  if (isOfficiallySoldStatus(status)) return false;
  const s = (status ?? "").trim();
  if (s === "") return true;
  return s.toLowerCase() === "available";
}

export type StandInventoryRow = {
  id: string;
  tenant_id: string;
  stand_number: string;
  land_use: string | null;
  area_sqm: number | null;
  phase: string | null;
  rights: string | null;
  status: string | null;
  purchase_price: number | null;
  agreement_requested: string | null;
  agreement_signed_warwickshire: string | null;
  agreement_signed_by_client: string | null;
  created_at: string;
  updated_at: string;
};

export type StandInventoryBuyerRow = {
  id: string;
  stand_inventory_id: string;
  first_name: string | null;
  surname: string | null;
  id_number: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  allocation: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type StandWithBuyers = StandInventoryRow & {
  stand_inventory_buyer: StandInventoryBuyerRow[];
};

export function buyerDisplayName(b: StandInventoryBuyerRow): string {
  const parts = [b.first_name, b.surname].filter(Boolean);
  return parts.join(" ").trim() || "—";
}

export function formatBuyersShort(buyers: StandInventoryBuyerRow[]): string {
  if (!buyers?.length) return "—";
  return buyers.map(buyerDisplayName).join(" · ");
}
