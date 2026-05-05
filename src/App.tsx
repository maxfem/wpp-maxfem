import { lazy, Suspense } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";

const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Customers = lazy(() => import("./pages/Customers"));
const Campaigns = lazy(() => import("./pages/Campaigns"));
const Automations = lazy(() => import("./pages/Automations"));
const AutomationDetails = lazy(() => import("./pages/AutomationDetails"));
const CampaignFlowEditor = lazy(() => import("./pages/CampaignFlowEditor"));
const CampaignDetails = lazy(() => import("./pages/CampaignDetails"));
const Activities = lazy(() => import("./pages/Activities"));
const Chat = lazy(() => import("./pages/Chat"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfUse = lazy(() => import("./pages/TermsOfUse"));
const MessageTemplates = lazy(() => import("./pages/MessageTemplates"));
const Lists = lazy(() => import("./pages/Lists"));
const SettingsWhatsApp = lazy(() => import("./pages/SettingsWhatsApp"));
const SettingsIntegrations = lazy(() => import("./pages/SettingsIntegrations"));
const SettingsYampi = lazy(() => import("./pages/SettingsYampi"));
const SettingsOpenAI = lazy(() => import("./pages/SettingsOpenAI"));
const SettingsBling = lazy(() => import("./pages/SettingsBling"));
const SettingsGemini = lazy(() => import("./pages/SettingsGemini"));
const SettingsInstagram = lazy(() => import("./pages/SettingsInstagram"));
const SettingsAWS = lazy(() => import("./pages/SettingsAWS"));
const SettingsPolicies = lazy(() => import("./pages/SettingsPolicies"));
const PreferenceCenter = lazy(() => import("./pages/PreferenceCenter"));
const LinkRedirect = lazy(() => import("./pages/LinkRedirect"));
const CRMPlanner = lazy(() => import("./pages/CRMPlanner"));
const EmailMarketing = lazy(() => import("./pages/EmailMarketing"));
const SettingsPixel = lazy(() => import("./pages/SettingsPixel"));
const PixelDashboard = lazy(() => import("./pages/PixelDashboard"));
const SettingsWebhooks = lazy(() => import("./pages/SettingsWebhooks"));
const Popups = lazy(() => import("./pages/Popups"));
const SettingsCollaborators = lazy(() => import("./pages/SettingsCollaborators"));
const PredictiveAnalytics = lazy(() => import("./pages/PredictiveAnalytics"));
const AuditLogs = lazy(() => import("./pages/AuditLogs"));
const SettingsMCP = lazy(() => import("./pages/SettingsMCP"));

const queryClient = new QueryClient();

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
                  <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                  <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
                  <Route path="/campaigns" element={<ProtectedRoute><Campaigns /></ProtectedRoute>} />
                  <Route path="/campaigns/flow/:id?" element={<ProtectedRoute><CampaignFlowEditor /></ProtectedRoute>} />
                  <Route path="/campaigns/:id" element={<ProtectedRoute><CampaignDetails /></ProtectedRoute>} />
                  <Route path="/automations" element={<ProtectedRoute><Automations /></ProtectedRoute>} />
                  <Route path="/automations/:id" element={<ProtectedRoute><AutomationDetails /></ProtectedRoute>} />
                  <Route path="/automations/flow/:id?" element={<ProtectedRoute><CampaignFlowEditor /></ProtectedRoute>} />
                  <Route path="/activities" element={<ProtectedRoute><Activities /></ProtectedRoute>} />
                  <Route path="/atendimento" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
                  <Route path="/email-marketing" element={<ProtectedRoute><EmailMarketing /></ProtectedRoute>} />
                  <Route path="/pixel" element={<ProtectedRoute><PixelDashboard /></ProtectedRoute>} />
                  <Route path="/predictive" element={<ProtectedRoute><PredictiveAnalytics /></ProtectedRoute>} />
                  <Route path="/settings/pixel" element={<ProtectedRoute><SettingsPixel /></ProtectedRoute>} />
                  <Route path="/popups" element={<ProtectedRoute><Popups /></ProtectedRoute>} />
                  <Route path="/chat" element={<Navigate to="/atendimento" replace />} />
                  <Route path="/templates" element={<ProtectedRoute><MessageTemplates /></ProtectedRoute>} />
                  <Route path="/lists" element={<ProtectedRoute><Lists /></ProtectedRoute>} />
                  <Route path="/listas" element={<ProtectedRoute><CRMPlanner /></ProtectedRoute>} />
                  <Route path="/lists/ai" element={<ProtectedRoute><CRMPlanner /></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                  <Route path="/settings/whatsapp" element={<ProtectedRoute><SettingsWhatsApp /></ProtectedRoute>} />
                  <Route path="/settings/integrations" element={<ProtectedRoute><SettingsIntegrations /></ProtectedRoute>} />
                  <Route path="/settings/integrations/yampi" element={<ProtectedRoute><SettingsYampi /></ProtectedRoute>} />
                  <Route path="/settings/integrations/openai" element={<ProtectedRoute><SettingsOpenAI /></ProtectedRoute>} />
                  <Route path="/settings/integrations/bling" element={<ProtectedRoute><SettingsBling /></ProtectedRoute>} />
                  <Route path="/settings/integrations/gemini" element={<ProtectedRoute><SettingsGemini /></ProtectedRoute>} />
                   <Route path="/settings/instagram" element={<ProtectedRoute><SettingsInstagram /></ProtectedRoute>} />
                   <Route path="/settings/integrations/aws" element={<ProtectedRoute><SettingsAWS /></ProtectedRoute>} />
                   <Route path="/settings/webhooks" element={<ProtectedRoute><SettingsWebhooks /></ProtectedRoute>} />
                   <Route path="/settings/collaborators" element={<ProtectedRoute><SettingsCollaborators /></ProtectedRoute>} />
                   <Route path="/settings/policies" element={<ProtectedRoute><SettingsPolicies /></ProtectedRoute>} />
                   <Route path="/settings/audit" element={<ProtectedRoute><AuditLogs /></ProtectedRoute>} />
                   <Route path="/settings/mcp" element={<ProtectedRoute><SettingsMCP /></ProtectedRoute>} />
                   <Route path="/settings/auditoria" element={<ProtectedRoute><AuditLogs /></ProtectedRoute>} />
                   <Route path="/auditoria" element={<ProtectedRoute><AuditLogs /></ProtectedRoute>} />
                   <Route path="/preferences/:token" element={<PreferenceCenter />} />
                   <Route path="/r/:code" element={<LinkRedirect />} />
                  <Route path="/privacy" element={<PrivacyPolicy />} />
                  <Route path="/terms" element={<TermsOfUse />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
