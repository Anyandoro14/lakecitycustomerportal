import { useEffect, useState } from "react";
import { backend, type Stand } from "@/lib/backend";

export function useStand(standNumber: string | undefined) {
  const [stand, setStand] = useState<Stand | null>(null);
  useEffect(() => {
    if (!standNumber) return;
    backend.listStands().then((list) => setStand(list.find((s) => s.standNumber === standNumber) ?? null));
  }, [standNumber]);
  return stand;
}
