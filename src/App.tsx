import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { track } from "@/lib/posthog";
import Index from "./pages/Index";
import AuthPage from "./pages/AuthPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import SuccessPage from "./pages/SuccessPage";
import AccountPage from "./pages/AccountPage";
import LandingPage from "./pages/LandingPage";
import AICopilotPage from "./pages/seo/AICopilotPage";
import AIVoiceAssistantPage from "./pages/seo/AIVoiceAssistantPage";
import AIImageGeneratorPage from "./pages/seo/AIImageGeneratorPage";
import AICodingAssistantPage from "./pages/seo/AICodingAssistantPage";
import AIWebsiteBuilderPage from "./pages/seo/AIWebsiteBuilderPage";
import AIAgentPlatformPage from "./pages/seo/AIAgentPlatformPage";
import UniversePage from "./pages/UniversePage";
import AdminAnalyticsPage from "./pages/AdminAnalyticsPage";
import AdminMintPage from "./pages/AdminMintPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import QADashboardPage from "./pages/QADashboardPage";
import QAStripePage from "./pages/QAStripePage";
import AdminMaintenancePage from "./pages/AdminMaintenancePage";
import TokenShopPage from "./pages/TokenShopPage";
import LeaderboardPage from "./pages/LeaderboardPage";
import MetaPreviewPage from "./pages/MetaPreviewPage";
import TermsOfServicePage from "./pages/TermsOfServicePage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// ── PostHog route-change tracker ─────────────────────────────────────────────
function PostHogPageTracker() {
  const location = useLocation();
  useEffect(() => {
    // posthog.capture_pageview auto-handles initial load;
    // this catches React-Router SPA navigations
    track('$pageview', { path: location.pathname + location.search });
  }, [location.pathname, location.search]);
  return null;
}

// ── Admin emails — add authorized admin addresses here ──────────────────────
const ADMIN_EMAILS = [
  'admin@mockj.ai',
  'mockj@mockj.ai',
  'owner@mockj.ai',
];

// ── Admin route guard: must be signed in + email in ADMIN_EMAILS ─────────────
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[hsl(224_20%_4%)]">
        <div className="w-8 h-8 rounded-xl animate-pulse" style={{ background: 'hsl(4 90% 58% / 0.3)', border: '1px solid hsl(4 90% 58% / 0.5)' }} />
      </div>
    );
  }
  if (!user || !ADMIN_EMAILS.includes(user.email?.toLowerCase() ?? '')) {
    // Silently redirect — don't even hint the route exists
    return <NotFound />;
  }
  return <>{children}</>;
}

// ── Root route: LandingPage for guests, MockJ app for signed-in users ────────
function RootRoute() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[hsl(224_20%_4%)]">
        <div className="w-8 h-8 rounded-xl animate-pulse" style={{ background: 'hsl(4 90% 58% / 0.3)', border: '1px solid hsl(4 90% 58% / 0.5)' }} />
      </div>
    );
  }
  return user ? <Index /> : <LandingPage />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <PostHogPageTracker />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="/success" element={<SuccessPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/landing" element={<LandingPage />} />
            <Route path="/ai-copilot" element={<AICopilotPage />} />
            <Route path="/ai-voice-assistant" element={<AIVoiceAssistantPage />} />
            <Route path="/ai-image-generator" element={<AIImageGeneratorPage />} />
            <Route path="/ai-coding-assistant" element={<AICodingAssistantPage />} />
            <Route path="/ai-website-builder" element={<AIWebsiteBuilderPage />} />
            <Route path="/ai-agent-platform" element={<AIAgentPlatformPage />} />
            <Route path="/universe" element={<UniversePage />} />
            <Route path="/admin/analytics" element={<AdminRoute><AdminAnalyticsPage /></AdminRoute>} />
            <Route path="/admin/mint" element={<AdminRoute><AdminMintPage /></AdminRoute>} />
            <Route path="/admin/dashboard" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />
            <Route path="/qa" element={<AdminRoute><QADashboardPage /></AdminRoute>} />
            <Route path="/qa/stripe" element={<AdminRoute><QAStripePage /></AdminRoute>} />
            <Route path="/admin/maintenance" element={<AdminRoute><AdminMaintenancePage /></AdminRoute>} />
            <Route path="/tokens" element={<TokenShopPage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/meta-preview" element={<MetaPreviewPage />} />
            <Route path="/terms" element={<TermsOfServicePage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
