import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute, PlayerRoute, ManagerRoute } from "@/components/ProtectedRoute";

import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import OnboardingPlayerPage from "./pages/OnboardingPlayerPage";
import OnboardingManagerPage from "./pages/OnboardingManagerPage";
import PlayerDashboard from "./pages/PlayerDashboard";
import PlayerAttributesPage from "./pages/PlayerAttributesPage";
import PlayerProfilePage from "./pages/PlayerProfilePage";
import PlayerContractPage from "./pages/PlayerContractPage";
import PlayerOffersPage from "./pages/PlayerOffersPage";
import PlayerClubPage from "./pages/PlayerClubPage";
import ManagerDashboard from "./pages/ManagerDashboard";
import ManagerClubPage from "./pages/ManagerClubPage";
import ManagerFinancePage from "./pages/ManagerFinancePage";
import ManagerStadiumPage from "./pages/ManagerStadiumPage";
import ManagerMarketPage from "./pages/ManagerMarketPage";
import ManagerSquadPage from "./pages/ManagerSquadPage";
import ManagerLineupPage from "./pages/ManagerLineupPage";
import ManagerChallengesPage from "./pages/ManagerChallengesPage";
import PlayerMatchesPage from "./pages/PlayerMatchesPage";
import MatchRoomPage from "./pages/MatchRoomPage";
import SoloPhysicsLabPage from "./pages/SoloPhysicsLabPage";
import LeaguePage from "./pages/LeaguePage";
import AccountProfilePage from "./pages/AccountProfilePage";
import NotificationsPage from "./pages/NotificationsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

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
            <Route path="/onboarding/manager" element={<ProtectedRoute><OnboardingManagerPage /></ProtectedRoute>} />
            <Route path="/player" element={<PlayerRoute><PlayerDashboard /></PlayerRoute>} />
            <Route path="/player/attributes" element={<PlayerRoute><PlayerAttributesPage /></PlayerRoute>} />
            <Route path="/player/profile" element={<PlayerRoute><PlayerProfilePage /></PlayerRoute>} />
            <Route path="/player/contract" element={<PlayerRoute><PlayerContractPage /></PlayerRoute>} />
            <Route path="/player/offers" element={<PlayerRoute><PlayerOffersPage /></PlayerRoute>} />
            <Route path="/player/club" element={<PlayerRoute><PlayerClubPage /></PlayerRoute>} />
            <Route path="/player/matches" element={<PlayerRoute><PlayerMatchesPage /></PlayerRoute>} />
            <Route path="/manager" element={<ManagerRoute><ManagerDashboard /></ManagerRoute>} />
            <Route path="/manager/club" element={<ManagerRoute><ManagerClubPage /></ManagerRoute>} />
            <Route path="/manager/finance" element={<ManagerRoute><ManagerFinancePage /></ManagerRoute>} />
            <Route path="/manager/stadium" element={<ManagerRoute><ManagerStadiumPage /></ManagerRoute>} />
            <Route path="/manager/market" element={<ManagerRoute><ManagerMarketPage /></ManagerRoute>} />
            <Route path="/manager/squad" element={<ManagerRoute><ManagerSquadPage /></ManagerRoute>} />
            <Route path="/manager/lineup" element={<ManagerRoute><ManagerLineupPage /></ManagerRoute>} />
            <Route path="/manager/challenges" element={<ManagerRoute><ManagerChallengesPage /></ManagerRoute>} />
            <Route path="/match/:id" element={<ProtectedRoute><MatchRoomPage /></ProtectedRoute>} />
            <Route path="/match-lab/solo" element={<ProtectedRoute><SoloPhysicsLabPage /></ProtectedRoute>} />
            <Route path="/league" element={<LeaguePage />} />
            <Route path="/account/profile" element={<ProtectedRoute><AccountProfilePage /></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
