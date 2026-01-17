import { createContext, useContext, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LookingGlassCustomer {
  standNumber: string;
  customerName: string;
  customerEmail: string;
  userId: string;
}

interface LookingGlassContextType {
  isLookingGlassMode: boolean;
  customer: LookingGlassCustomer | null;
  enterLookingGlass: (customer: LookingGlassCustomer, adminEmail: string) => Promise<boolean>;
  exitLookingGlass: () => void;
  sessionStartTime: Date | null;
}

const LookingGlassContext = createContext<LookingGlassContextType | undefined>(undefined);

export const useLookingGlass = () => {
  const context = useContext(LookingGlassContext);
  if (!context) {
    throw new Error("useLookingGlass must be used within a LookingGlassProvider");
  }
  return context;
};

interface LookingGlassProviderProps {
  children: ReactNode;
}

export const LookingGlassProvider = ({ children }: LookingGlassProviderProps) => {
  const [isLookingGlassMode, setIsLookingGlassMode] = useState(false);
  const [customer, setCustomer] = useState<LookingGlassCustomer | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);

  const enterLookingGlass = useCallback(async (
    targetCustomer: LookingGlassCustomer, 
    adminEmail: string
  ): Promise<boolean> => {
    try {
      // Verify admin is @lakecity.co.zw
      if (!adminEmail.toLowerCase().endsWith("@lakecity.co.zw")) {
        toast.error("Access denied: Only LakeCity staff can use Looking Glass");
        return false;
      }

      // Log the Looking Glass session start
      const { error: auditError } = await supabase.from("audit_log").insert({
        action: "looking_glass_enter",
        entity_type: "customer_view",
        entity_id: targetCustomer.standNumber,
        performed_by_email: adminEmail,
        details: {
          customer_stand: targetCustomer.standNumber,
          customer_name: targetCustomer.customerName,
          customer_email: targetCustomer.customerEmail,
          session_start: new Date().toISOString()
        }
      });

      if (auditError) {
        console.error("Failed to log Looking Glass entry:", auditError);
        // Continue anyway - audit failure shouldn't block the feature
      }

      setCustomer(targetCustomer);
      setSessionStartTime(new Date());
      setIsLookingGlassMode(true);
      
      toast.success(`Viewing account for ${targetCustomer.customerName} (Read-Only)`);
      return true;
    } catch (error) {
      console.error("Failed to enter Looking Glass mode:", error);
      toast.error("Failed to enter Looking Glass mode");
      return false;
    }
  }, []);

  const exitLookingGlass = useCallback(async () => {
    if (customer && sessionStartTime) {
      try {
        // Get current admin email
        const { data: { session } } = await supabase.auth.getSession();
        const adminEmail = session?.user?.email || "unknown";

        // Log the Looking Glass session end
        await supabase.from("audit_log").insert({
          action: "looking_glass_exit",
          entity_type: "customer_view",
          entity_id: customer.standNumber,
          performed_by_email: adminEmail,
          details: {
            customer_stand: customer.standNumber,
            customer_name: customer.customerName,
            session_start: sessionStartTime.toISOString(),
            session_end: new Date().toISOString(),
            duration_seconds: Math.round((new Date().getTime() - sessionStartTime.getTime()) / 1000)
          }
        });
      } catch (error) {
        console.error("Failed to log Looking Glass exit:", error);
      }
    }

    setIsLookingGlassMode(false);
    setCustomer(null);
    setSessionStartTime(null);
    toast.info("Exited Looking Glass mode");
  }, [customer, sessionStartTime]);

  return (
    <LookingGlassContext.Provider value={{
      isLookingGlassMode,
      customer,
      enterLookingGlass,
      exitLookingGlass,
      sessionStartTime
    }}>
      {children}
    </LookingGlassContext.Provider>
  );
};
