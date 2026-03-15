import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import PlayerDashboard from "./pages/PlayerDashboard";
import PlayerAttributesPage from "./pages/PlayerAttributesPage";
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
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/player" element={<PlayerDashboard />} />
          <Route path="/player/attributes" element={<PlayerAttributesPage />} />
          <Route path="/manager" element={<ManagerDashboard />} />
          <Route path="/league" element={<LeaguePage />} />
          <Route path="/match" element={<MatchPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
