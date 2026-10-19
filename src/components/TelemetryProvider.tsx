import { useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  identifyUser,
  initTelemetry,
  resetTelemetryIdentity,
} from "@/lib/telemetry";

/**
 * Boots PostHog (inert without env) and identifies with a salted hash only.
 * Renders children unchanged — no UI.
 */
export function TelemetryProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    initTelemetry();

    let mounted = true;

    const syncIdentity = async (userId: string | undefined | null) => {
      if (!mounted) return;
      if (userId) {
        await identifyUser(userId);
      } else {
        resetTelemetryIdentity();
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      void syncIdentity(session?.user?.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncIdentity(session?.user?.id);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return <>{children}</>;
}

export default TelemetryProvider;
