import { useEffect, useState } from "react";
import { backend, type Stand } from "@/lib/backend";
import { bandOf, priceBands, standPriceCents, type PriceBandKey } from "@shared/domain/campaign.ts";

export function useStand(standNumber: string | undefined) {
  const [state, setState] = useState<{ stand: Stand | null; band?: PriceBandKey; loading: boolean; error: string | null }>({
    stand: null,
    loading: true,
    error: null,
  });
  useEffect(() => {
    if (!standNumber) return;
    backend
      .listStands()
      .then((list) => {
        const stand = list.find((s) => s.standNumber === standNumber) ?? null;
        const bands = priceBands(list.filter((s) => s.sizeSqm).map((s) => standPriceCents(s.sizeSqm!)));
        const band = stand?.sizeSqm && bands ? bandOf(standPriceCents(stand.sizeSqm), bands) : undefined;
        setState({ stand, band, loading: false, error: stand ? null : `Stand ${standNumber} isn't part of this campaign.` });
      })
      .catch((e) => setState({ stand: null, loading: false, error: e instanceof Error ? e.message : "Could not load the stand." }));
  }, [standNumber]);
  return state;
}
