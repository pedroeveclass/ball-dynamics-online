import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute, PlayerRoute } from "@/components/ProtectedRoute";

import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import OnboardingPlayerPage from "./pages/OnboardingPlayerPage";
import PlayerDashboard from "./pages/PlayerDashboard";
import PlayerAttributesPage from "./pages/PlayerAttributesPage";
import PlayerProfilePage from "./pages/PlayerProfilePage";
import PlayerContractPage from "./pages/PlayerContractPage";
import ManagerDashboard from "./pages/ManagerDashboard";
import LeaguePage from "./pages/LeaguePage";
import MatchPage from "./pages/MatchPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/onboarding/player" element={<ProtectedRoute><OnboardingPlayerPage /></ProtectedRoute>} />
            <Route path="/player" element={<PlayerRoute><PlayerDashboard /></PlayerRoute>} />
            <Route path="/player/attributes" element={<PlayerRoute><PlayerAttributesPage /></PlayerRoute>} />
            <Route path="/player/profile" element={<PlayerRoute><PlayerProfilePage /></PlayerRoute>} />
            <Route path="/player/contract" element={<PlayerRoute><PlayerContractPage /></PlayerRoute>} />
            <Route path="/manager" element={<ManagerDashboard />} />
            <Route path="/league" element={<LeaguePage />} />
            <Route path="/match" element={<MatchPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
