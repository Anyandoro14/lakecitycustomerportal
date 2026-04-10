// Maintenance gate removed — no scheduled-maintenance logic needed.
// These are kept as no-op exports so existing imports in App.tsx don't break.

export function MaintenanceRibbon() {
  return null;
}

export default function MaintenanceGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
