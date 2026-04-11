import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import Campaigns from "./pages/Campaigns";
import Automations from "./pages/Automations";
import CampaignFlowEditor from "./pages/CampaignFlowEditor";
import CampaignDetails from "./pages/CampaignDetails";
import Activities from "./pages/Activities";
import Chat from "./pages/Chat";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfUse from "./pages/TermsOfUse";
import MessageTemplates from "./pages/MessageTemplates";
import Lists from "./pages/Lists";
import SettingsWhatsApp from "./pages/SettingsWhatsApp";
import SettingsIntegrations from "./pages/SettingsIntegrations";
import SettingsYampi from "./pages/SettingsYampi";
import SettingsOpenAI from "./pages/SettingsOpenAI";
import SettingsBling from "./pages/SettingsBling";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
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
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
            <Route path="/campaigns" element={<ProtectedRoute><Campaigns /></ProtectedRoute>} />
            <Route path="/campaigns/flow/:id?" element={<ProtectedRoute><CampaignFlowEditor /></ProtectedRoute>} />
            <Route path="/campaigns/:id" element={<ProtectedRoute><CampaignDetails /></ProtectedRoute>} />
            <Route path="/automations" element={<ProtectedRoute><Automations /></ProtectedRoute>} />
            <Route path="/automations/flow/:id?" element={<ProtectedRoute><CampaignFlowEditor /></ProtectedRoute>} />
            <Route path="/activities" element={<ProtectedRoute><Activities /></ProtectedRoute>} />
            <Route path="/atendimento" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
            <Route path="/chat" element={<Navigate to="/atendimento" replace />} />
            <Route path="/templates" element={<ProtectedRoute><MessageTemplates /></ProtectedRoute>} />
            <Route path="/lists" element={<ProtectedRoute><Lists /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            <Route path="/settings/whatsapp" element={<ProtectedRoute><SettingsWhatsApp /></ProtectedRoute>} />
            <Route path="/settings/integrations" element={<ProtectedRoute><SettingsIntegrations /></ProtectedRoute>} />
            <Route path="/settings/integrations/yampi" element={<ProtectedRoute><SettingsYampi /></ProtectedRoute>} />
            <Route path="/settings/integrations/openai" element={<ProtectedRoute><SettingsOpenAI /></ProtectedRoute>} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfUse />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
