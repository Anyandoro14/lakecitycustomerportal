/* build-refresh 2026-04-10 */
import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import ErrorBoundary from "@/components/ErrorBoundary";
import { LookingGlassProvider } from "@/contexts/LookingGlassContext";
import { TenantProvider } from "@/contexts/TenantContext";
import MaintenanceGate, { MaintenanceRibbon } from "@/components/MaintenanceGate";
import SupabaseConfigMissing from "@/components/SupabaseConfigMissing";
import { isSupabaseConfigured } from "@/integrations/supabase/client";

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
const CollectionsCommandCenter = lazy(() => import("./pages/CollectionsCommandCenter"));
const CollectionsGuide = lazy(() => import("./pages/CollectionsGuide"));
const TrainingCenter = lazy(() => import("./pages/TrainingCenter"));
const TrainingModule = lazy(() => import("./pages/TrainingModule"));
const PaymentGatewayProposal = lazy(() => import("./pages/PaymentGatewayProposal"));
const PaymentGatewaySpecifications = lazy(() => import("./pages/PaymentGatewaySpecifications"));
const DocsHome = lazy(() => import("./pages/docs/DocsHome"));
const DocsGlossary = lazy(() => import("./pages/docs/DocsGlossary"));
const DocsDataModels = lazy(() => import("./pages/docs/DocsDataModels"));
const DocsSheets = lazy(() => import("./pages/docs/DocsSheets"));
const DocsApiReference = lazy(() => import("./pages/docs/DocsApiReference"));
const DocsEndpoints = lazy(() => import("./pages/docs/DocsEndpoints"));
const DocsWebhooks = lazy(() => import("./pages/docs/DocsWebhooks"));
const DocsAuthentication = lazy(() => import("./pages/docs/DocsAuthentication"));
const DocsQuickstart = lazy(() => import("./pages/docs/DocsQuickstart"));
const DocsErrors = lazy(() => import("./pages/docs/DocsErrors"));
const CrmSpecifications = lazy(() => import("./pages/CrmSpecifications"));
const CrmTechnicalSpecs = lazy(() => import("./pages/CrmTechnicalSpecs"));
const QcQueue = lazy(() => import("./pages/admin/QcQueue"));
const UnderConstruction = lazy(() => import("./pages/UnderConstruction"));

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
        {!isSupabaseConfigured ? (
          <SupabaseConfigMissing />
        ) : (
        <TenantProvider>
        <LookingGlassProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <MaintenanceRibbon />
            <MaintenanceGate>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/under-construction" element={<UnderConstruction />} />
                  <Route path="/internal-login" element={<InternalLogin />} />
                  <Route path="/internal" element={<InternalPortal />} />
                  <Route path="/internal-portal" element={<InternalPortal />} />
                  <Route path="*" element={<UnderConstruction />} />
                </Routes>
              </Suspense>
            </MaintenanceGate>
          </BrowserRouter>
        </LookingGlassProvider>
        </TenantProvider>
        )}
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
