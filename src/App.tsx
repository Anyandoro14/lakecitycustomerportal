import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { CurrentStepRedirect } from "@/components/WizardShell";
import { Toaster } from "@/components/ui/sonner";
import Landing from "@/pages/Landing";
import Intake from "@/pages/Intake";
import IdReviewStep from "@/pages/IdReviewStep";
import OfferStep from "@/pages/OfferStep";
import ScheduleStep from "@/pages/ScheduleStep";
import PaymentStep from "@/pages/PaymentStep";
import AgreementStep from "@/pages/AgreementStep";
import PortalStep from "@/pages/PortalStep";
import CompleteStep from "@/pages/CompleteStep";
import Dashboard from "@/pages/internal/Dashboard";
import LeadDetail from "@/pages/internal/LeadDetail";
import Outbox from "@/pages/internal/Outbox";

function NotFound() {
  return (
    <div className="container py-24 text-center">
      <h1 className="font-serif text-3xl font-semibold">Page not found</h1>
      <Link to="/" className="mt-4 inline-block underline">Back to the campaign</Link>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/apply" element={<Intake />} />
          <Route path="/apply/:leadId" element={<CurrentStepRedirect />} />
          <Route path="/apply/:leadId/id-review" element={<IdReviewStep />} />
          <Route path="/apply/:leadId/offer" element={<OfferStep />} />
          <Route path="/apply/:leadId/schedule" element={<ScheduleStep />} />
          <Route path="/apply/:leadId/payment" element={<PaymentStep />} />
          <Route path="/apply/:leadId/agreement" element={<AgreementStep />} />
          <Route path="/apply/:leadId/portal" element={<PortalStep />} />
          <Route path="/apply/:leadId/complete" element={<CompleteStep />} />
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
