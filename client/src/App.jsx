import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import AppLayout from "./layouts/AppLayout.jsx";
import AuthLayout from "./layouts/AuthLayout.jsx";
import Analytics from "./pages/Analytics.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import HeadToHead from "./pages/HeadToHead.jsx";
import LiveMatch from "./pages/LiveMatch.jsx";
import Login from "./pages/Login.jsx";
import MatchHistory from "./pages/MatchHistory.jsx";
import MatchReport from "./pages/MatchReport.jsx";
import MatchSetup from "./pages/MatchSetup.jsx";
import PlayerManagement from "./pages/PlayerManagement.jsx";
import Register from "./pages/Register.jsx";
import Settings from "./pages/Settings.jsx";
import { PageLoader } from "./components/UI.jsx";

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader full label="Restoring your session" />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="setup" element={<MatchSetup />} />
        <Route path="players" element={<PlayerManagement />} />
        <Route path="live" element={<LiveMatch />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="head-to-head" element={<HeadToHead />} />
        <Route path="matches" element={<MatchHistory />} />
        <Route path="matches/:id" element={<MatchReport />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
