import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import ErrorBoundary from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import ForgotPassword from "./pages/ForgotPassword";
import Settings from "./pages/Settings";
import MonthlyStatements from "./pages/MonthlyStatements";
import AgreementOfSaleDocuments from "./pages/AgreementOfSaleDocuments";
import Reporting from "./pages/Reporting";
import AccountManagement from "./pages/AccountManagement";
import Guide from "./pages/Guide";
import SupportRequest from "./pages/SupportRequest";
import StandLedgerLanding from "./pages/StandLedgerLanding";
import InternalPortal from "./pages/InternalPortal";
import InternalLogin from "./pages/InternalLogin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/monthly-statements" element={<MonthlyStatements />} />
            <Route path="/agreement-of-sale" element={<AgreementOfSaleDocuments />} />
            <Route path="/reporting" element={<Reporting />} />
            <Route path="/account-management" element={<AccountManagement />} />
            <Route path="/guide" element={<Guide />} />
            <Route path="/support" element={<SupportRequest />} />
            <Route path="/standsledger" element={<StandLedgerLanding />} />
            <Route path="/internal" element={<InternalPortal />} />
            <Route path="/internal-login" element={<InternalLogin />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
