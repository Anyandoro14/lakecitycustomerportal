import { Link } from "react-router-dom";

/**
 * Global portal footer — must render on every page, including login / OTP.
 * Privacy notice points users here for analytics controls.
 */
export function PortalFooter() {
  return (
    <footer
      data-testid="portal-footer"
      className="w-full border-t border-border bg-background px-4 py-6 text-center text-xs text-muted-foreground"
    >
      <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-x-4 gap-y-1">
        <Link to="/privacy-analytics" className="hover:text-primary hover:underline">
          Privacy &amp; analytics
        </Link>
        <Link to="/privacy" className="hover:text-primary hover:underline">
          Privacy notice
        </Link>
        <Link to="/terms" className="hover:text-primary hover:underline">
          Terms
        </Link>
        <Link to="/refund-policy" className="hover:text-primary hover:underline">
          Refunds
        </Link>
      </div>
      <p className="mt-2">
        © {new Date().getFullYear()} Warwickshire PVT Ltd.
      </p>
    </footer>
  );
}

export default PortalFooter;
