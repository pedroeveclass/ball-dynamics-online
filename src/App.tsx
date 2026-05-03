import { Suspense, lazy, Component, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute, PlayerRoute, ManagerRoute, ManagerOrAssistantRoute, AdminRoute } from "@/components/ProtectedRoute";

// Critical pages — static imports (landing, auth, 404)
import LandingPage from "./pages/LandingPage";
import AvatarPreviewPage from "./pages/AvatarPreviewPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import NotFound from "./pages/NotFound";

// Lazy-loaded pages
const OnboardingPlayerPage = lazy(() => import("./pages/OnboardingPlayerPage"));
const OnboardingManagerPage = lazy(() => import("./pages/OnboardingManagerPage"));
const PlayerDashboard = lazy(() => import("./pages/PlayerDashboard"));
const PlayerAttributesPage = lazy(() => import("./pages/PlayerAttributesPage"));
const PlayerTrainingPlanPage = lazy(() => import("./pages/PlayerTrainingPlanPage"));
const PlayerProfilePage = lazy(() => import("./pages/PlayerProfilePage"));
const PlayerOriginPage = lazy(() => import("./pages/PlayerOriginPage"));
const InboxPage = lazy(() => import("./pages/InboxPage"));
const PlayerContractPage = lazy(() => import("./pages/PlayerContractPage"));
const PlayerOffersPage = lazy(() => import("./pages/PlayerOffersPage"));
const PlayerClubPage = lazy(() => import("./pages/PlayerClubPage"));
const AvatarCreatePage = lazy(() => import("./pages/AvatarCreatePage"));
const ManagerAvatarCreatePage = lazy(() => import("./pages/ManagerAvatarCreatePage"));
const ManagerDashboard = lazy(() => import("./pages/ManagerDashboard"));
const ManagerClubPage = lazy(() => import("./pages/ManagerClubPage"));
const ManagerFinancePage = lazy(() => import("./pages/ManagerFinancePage"));
const ManagerStadiumPage = lazy(() => import("./pages/ManagerStadiumPage"));
const ManagerMarketPage = lazy(() => import("./pages/ManagerMarketPage"));
const ManagerSquadPage = lazy(() => import("./pages/ManagerSquadPage"));
const ManagerLineupPage = lazy(() => import("./pages/ManagerLineupPage"));
const SituationalTacticsPage = lazy(() => import("./pages/SituationalTacticsPage"));
const ManagerChallengesPage = lazy(() => import("./pages/ManagerChallengesPage"));
const ManagerCoachPage = lazy(() => import("./pages/ManagerCoachPage"));
const ManagerReportsPage = lazy(() => import("./pages/ManagerReportsPage"));
const PlayerMatchesPage = lazy(() => import("./pages/PlayerMatchesPage"));
const MatchRoomPage = lazy(() => import("./pages/MatchRoomPage"));
const SoloPhysicsLabPage = lazy(() => import("./pages/SoloPhysicsLabPage"));
const LeaguePage = lazy(() => import("./pages/LeaguePage"));
const PublicClubPage = lazy(() => import("./pages/PublicClubPage"));
const PublicPlayerPage = lazy(() => import("./pages/PublicPlayerPage"));
const LeagueScheduleVotePage = lazy(() => import("./pages/LeagueScheduleVotePage"));
const HallOfFamePage = lazy(() => import("./pages/HallOfFamePage"));
const ManagerFacilitiesPage = lazy(() => import("./pages/ManagerFacilitiesPage"));
const AccountProfilePage = lazy(() => import("./pages/AccountProfilePage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const MatchReplayPage = lazy(() => import("./pages/MatchReplayPage"));
const StorePage = lazy(() => import("./pages/StorePage"));
const BankPage = lazy(() => import("./pages/BankPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const ForumPage = lazy(() => import("./pages/ForumPage"));
const ForumTopicPage = lazy(() => import("./pages/ForumTopicPage"));
const PickupListPage = lazy(() => import("./pages/PickupListPage"));
const PickupLobbyPage = lazy(() => import("./pages/PickupLobbyPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 5 * 60 * 1000, // 5 min cache — avoid refetching on tab switch
      gcTime: 10 * 60 * 1000,   // 10 min garbage collection
    },
  },
});

// ── Auto-reload on chunk load failure (stale deploy cache) ──
class ChunkErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) {
    if (error.message?.includes('dynamically imported module') || error.message?.includes('Failed to fetch')) {
      // Stale chunk — force full reload once
      const key = 'chunk_reload_' + window.location.pathname;
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
      }
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-3">
          <p className="text-muted-foreground">Atualizando versão...</p>
          <button onClick={() => window.location.reload()} className="text-sm text-pitch underline">Recarregar</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ChunkErrorBoundary>
          <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            {/* TEMP — V2 avatar sandbox, remove after V2 ships */}
            <Route path="/avatar-preview" element={<AvatarPreviewPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/onboarding/player" element={<ProtectedRoute><OnboardingPlayerPage /></ProtectedRoute>} />
            <Route path="/onboarding/manager" element={<ProtectedRoute><OnboardingManagerPage /></ProtectedRoute>} />
            <Route path="/player/avatar/create" element={<ProtectedRoute><AvatarCreatePage /></ProtectedRoute>} />
            <Route path="/manager/avatar/create" element={<ProtectedRoute><ManagerAvatarCreatePage /></ProtectedRoute>} />
            <Route path="/player" element={<PlayerRoute><PlayerDashboard /></PlayerRoute>} />
            <Route path="/player/attributes" element={<PlayerRoute><PlayerAttributesPage /></PlayerRoute>} />
            <Route path="/player/training-plan" element={<PlayerRoute><PlayerTrainingPlanPage /></PlayerRoute>} />
            <Route path="/player/profile" element={<PlayerRoute><PlayerProfilePage /></PlayerRoute>} />
            {/* Backfill page — bypasses PlayerRoute to avoid redirect loop */}
            <Route path="/player/origem" element={<ProtectedRoute><PlayerOriginPage /></ProtectedRoute>} />
            <Route path="/player/contract" element={<PlayerRoute><PlayerContractPage /></PlayerRoute>} />
            <Route path="/player/offers" element={<PlayerRoute><PlayerOffersPage /></PlayerRoute>} />
            <Route path="/player/club" element={<PlayerRoute><PlayerClubPage /></PlayerRoute>} />
            <Route path="/player/matches" element={<PlayerRoute><PlayerMatchesPage /></PlayerRoute>} />
            <Route path="/varzea" element={<PlayerRoute><PickupListPage /></PlayerRoute>} />
            <Route path="/varzea/:id" element={<PlayerRoute><PickupLobbyPage /></PlayerRoute>} />
            <Route path="/manager" element={<ManagerRoute><ManagerDashboard /></ManagerRoute>} />
            <Route path="/manager/club" element={<ManagerRoute><ManagerClubPage /></ManagerRoute>} />
            <Route path="/manager/finance" element={<ManagerRoute><ManagerFinancePage /></ManagerRoute>} />
            <Route path="/manager/stadium" element={<ManagerRoute><ManagerStadiumPage /></ManagerRoute>} />
            <Route path="/manager/market" element={<ManagerRoute><ManagerMarketPage /></ManagerRoute>} />
            <Route path="/manager/squad" element={<ManagerRoute><ManagerSquadPage /></ManagerRoute>} />
            <Route path="/manager/lineup" element={<ManagerOrAssistantRoute><ManagerLineupPage /></ManagerOrAssistantRoute>} />
            <Route path="/manager/lineup/tactics" element={<ManagerOrAssistantRoute><SituationalTacticsPage /></ManagerOrAssistantRoute>} />
            <Route path="/manager/challenges" element={<ManagerRoute><ManagerChallengesPage /></ManagerRoute>} />
            <Route path="/match/:id" element={<ProtectedRoute><MatchRoomPage /></ProtectedRoute>} />
            <Route path="/match/:id/replay" element={<MatchReplayPage />} />
            <Route path="/match-lab/solo" element={<ProtectedRoute><SoloPhysicsLabPage /></ProtectedRoute>} />
            <Route path="/league" element={<LeaguePage />} />
            <Route path="/club/:clubId" element={<PublicClubPage />} />
            <Route path="/player/:playerId" element={<PublicPlayerPage />} />
            <Route path="/league/vote" element={<ManagerRoute><LeagueScheduleVotePage /></ManagerRoute>} />
            <Route path="/league/hall-of-fame" element={<HallOfFamePage />} />
            <Route path="/manager/facilities" element={<ManagerRoute><ManagerFacilitiesPage /></ManagerRoute>} />
            <Route path="/manager/coach" element={<ManagerRoute><ManagerCoachPage /></ManagerRoute>} />
            <Route path="/manager/relatorios" element={<ManagerRoute><ManagerReportsPage /></ManagerRoute>} />
            <Route path="/account/profile" element={<ProtectedRoute><AccountProfilePage /></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
            <Route path="/inbox" element={<ProtectedRoute><InboxPage /></ProtectedRoute>} />
            <Route path="/store" element={<ProtectedRoute><StorePage /></ProtectedRoute>} />
            <Route path="/bank" element={<ProtectedRoute><BankPage /></ProtectedRoute>} />
            <Route path="/forum" element={<ForumPage />} />
            <Route path="/forum/t/:topicId" element={<ForumTopicPage />} />
            <Route path="/forum/:categorySlug" element={<ForumPage />} />
            <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </ChunkErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
