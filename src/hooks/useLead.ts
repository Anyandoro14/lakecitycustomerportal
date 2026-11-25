import { useCallback, useEffect, useState } from "react";
import { backend, type Lead } from "@/lib/backend";

export function useLead(leadId: string | undefined, pollMs?: number) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!leadId) return;
    try {
      const l = await backend.getLead(leadId);
      setLead(l);
      setError(l ? null : "We couldn't find this application.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void refresh();
    if (!pollMs) return;
    const t = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);

  return { lead, loading, error, refresh };
}
