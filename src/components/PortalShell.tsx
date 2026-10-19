import type { ReactNode } from "react";
import PortalFooter from "@/components/PortalFooter";

/** App chrome: page content + global footer (login, OTP, and signed-in). */
export function PortalShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex-1">{children}</div>
      <PortalFooter />
    </div>
  );
}

export default PortalShell;
