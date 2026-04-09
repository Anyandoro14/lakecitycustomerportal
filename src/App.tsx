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
        <TenantProvider>
        <LookingGlassProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <MaintenanceRibbon />
            <MaintenanceGate>
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
                  <Route path="/internal" element={<InternalPortal />} />
                  <Route path="/internal-portal" element={<InternalPortal />} />
                  <Route path="/internal-login" element={<InternalLogin />} />
                  <Route path="/internal-signup" element={<InternalSignUp />} />
                  <Route path="/looking-glass" element={<LookingGlassView />} />
                  <Route path="/support-guide" element={<CustomerSupportGuide />} />
                  <Route path="/customer-update" element={<CustomerUpdate />} />
                  <Route path="/updates" element={<Updates />} />
                  <Route path="/article-feedback" element={<ArticleFeedbackDashboard />} />
                  <Route path="/collections" element={<CollectionsCommandCenter />} />
                  <Route path="/collections-guide" element={<CollectionsGuide />} />
                  <Route path="/payment-gateway" element={<PaymentGatewayProposal />} />
                  <Route path="/payment-gateway/specifications" element={<PaymentGatewaySpecifications />} />
                  <Route path="/docs" element={<DocsHome />} />
                  <Route path="/docs/glossary" element={<DocsGlossary />} />
                  <Route path="/docs/quickstart" element={<DocsQuickstart />} />
                  <Route path="/docs/data-models" element={<DocsDataModels />} />
                  <Route path="/docs/sheets" element={<DocsSheets />} />
                  <Route path="/docs/api-reference" element={<DocsApiReference />} />
                  <Route path="/docs/endpoints" element={<DocsEndpoints />} />
                  <Route path="/docs/webhooks" element={<DocsWebhooks />} />
                  <Route path="/docs/authentication" element={<DocsAuthentication />} />
                  <Route path="/docs/errors" element={<DocsErrors />} />
                  <Route path="/crm-specs" element={<CrmSpecifications />} />
                  <Route path="/crm-specs/technical" element={<CrmTechnicalSpecs />} />
                  <Route path="/admin/qc-queue" element={<QcQueue />} />
                  <Route path="/training" element={<TrainingCenter />} />
                  <Route path="/training/:path/:moduleId" element={<TrainingModule />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </MaintenanceGate>
          </BrowserRouter>
        </LookingGlassProvider>
        </TenantProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
