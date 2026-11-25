import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { CurrentStepRedirect } from "@/components/WizardShell";
import { Toaster } from "@/components/ui/sonner";
import Landing from "@/pages/Landing";
import StandPage from "@/pages/StandPage";
import OfferStep from "@/pages/OfferStep";
import PaymentStep from "@/pages/PaymentStep";
import CelebrationStep from "@/pages/CelebrationStep";
import PortalStep from "@/pages/PortalStep";
import MockIveri from "@/pages/MockIveri";
import { backend } from "@/lib/backend";
import Dashboard from "@/pages/internal/Dashboard";
import LeadDetail from "@/pages/internal/LeadDetail";
import Outbox from "@/pages/internal/Outbox";

function NotFound() {
  return (
    <div className="container py-24 text-center">
      <h1 className="font-serif text-3xl font-semibold">Page not found</h1>
      <Link to="/" className="mt-4 inline-block underline">Back to the stand list</Link>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/stands/:standNumber" element={<StandPage />} />
          <Route path="/apply/:leadId" element={<CurrentStepRedirect />} />
          <Route path="/apply/:leadId/offer" element={<OfferStep />} />
          <Route path="/apply/:leadId/payment" element={<PaymentStep />} />
          <Route path="/apply/:leadId/celebration" element={<CelebrationStep />} />
          <Route path="/apply/:leadId/portal" element={<PortalStep />} />
          {backend.mode === "mock" && <Route path="/mock-iveri/:reference" element={<MockIveri />} />}
          <Route path="/internal" element={<Dashboard />} />
          <Route path="/internal/leads/:leadId" element={<LeadDetail />} />
          <Route path="/internal/outbox" element={<Outbox />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      <Toaster richColors position="top-center" />
    </BrowserRouter>
  );
}
