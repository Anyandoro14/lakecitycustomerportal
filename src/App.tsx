import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import ErrorBoundary from "@/components/ErrorBoundary";
import { LookingGlassProvider } from "@/contexts/LookingGlassContext";

// Critical path - loaded immediately
import Login from "./pages/Login";

// Lazy load all other pages for better FCP
const Index = lazy(() => import("./pages/Index"));
const SignUp = lazy(() => import("./pages/SignUp"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const Settings = lazy(() => import("./pages/Settings"));
const MonthlyStatements = lazy(() => import("./pages/MonthlyStatements"));
const AgreementOfSaleDocuments = lazy(() => import("./pages/AgreementOfSaleDocuments"));
const Reporting = lazy(() => import("./pages/Reporting"));
const AccountManagement = lazy(() => import("./pages/AccountManagement"));
const Guide = lazy(() => import("./pages/Guide"));
const SupportRequest = lazy(() => import("./pages/SupportRequest"));
const StandLedgerLanding = lazy(() => import("./pages/StandLedgerLanding"));
const InternalPortal = lazy(() => import("./pages/InternalPortal"));
const InternalLogin = lazy(() => import("./pages/InternalLogin"));
const InternalSignUp = lazy(() => import("./pages/InternalSignUp"));
const LookingGlassView = lazy(() => import("./pages/LookingGlassView"));
const NotFound = lazy(() => import("./pages/NotFound"));
const CustomerSupportGuide = lazy(() => import("./pages/CustomerSupportGuide"));
const CustomerUpdate = lazy(() => import("./pages/CustomerUpdate"));
const Updates = lazy(() => import("./pages/Updates"));
const ArticleFeedbackDashboard = lazy(() => import("./pages/ArticleFeedbackDashboard"));

const queryClient = new QueryClient();

// Minimal loading fallback to avoid layout shift
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="animate-pulse text-muted-foreground">Loading...</div>
  </div>
);

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LookingGlassProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<PageLoader />}>
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
                {/* Backward-compatible internal portal route (OAuth redirects, old links) */}
                <Route path="/internal" element={<InternalPortal />} />
                <Route path="/internal-portal" element={<InternalPortal />} />
                <Route path="/internal-login" element={<InternalLogin />} />
                <Route path="/internal-signup" element={<InternalSignUp />} />
                <Route path="/looking-glass" element={<LookingGlassView />} />
                <Route path="/support-guide" element={<CustomerSupportGuide />} />
                <Route path="/customer-update" element={<CustomerUpdate />} />
                <Route path="/updates" element={<Updates />} />
                <Route path="/article-feedback" element={<ArticleFeedbackDashboard />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </LookingGlassProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
