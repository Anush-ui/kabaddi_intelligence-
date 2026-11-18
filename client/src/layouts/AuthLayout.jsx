import { Navigate, Outlet } from "react-router-dom";
import logo from "../assets/logo.svg";
import { useAuth } from "../context/AuthContext.jsx";
import { PageLoader } from "../components/UI.jsx";
import {
  AnalyticsIcon,
  BoltIcon,
  HeadToHeadIcon,
  ShieldIcon,
} from "../components/Icons.jsx";

export default function AuthLayout() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return <PageLoader full label="Restoring your session" />;
  if (isAuthenticated) return <Navigate to="/" replace />;

  return (
    <div className="auth-shell">
      <section className="auth-brand">
        <div className="auth-brand-inner">
          <div className="auth-logo">
            <img src={logo} alt="" width="52" height="52" />
            <div>
              <span className="auth-logo-name">KABADDI COACH</span>
              <span className="auth-logo-sub">INTELLIGENCE PLATFORM</span>
            </div>
          </div>

          <h1 className="auth-headline">
            Read the mat.
            <br />
            <span>Win the match.</span>
          </h1>
          <p className="auth-copy">
            Pro Kabaddi League analytics with five cross-validated win-probability models,
            Bayesian player updates and live lineup simulation.
          </p>

          <div className="auth-features">
            <div className="auth-feature">
              <BoltIcon />
              <div>
                <strong>Live win probability</strong>
                <span>Score shifts and lineup changes recalculated instantly.</span>
              </div>
            </div>
            <div className="auth-feature">
              <AnalyticsIcon />
              <div>
                <strong>Five-model election</strong>
                <span>Logistic Regression, Random Forest, Gradient Boosting, Naive Bayes, SVM.</span>
              </div>
            </div>
            <div className="auth-feature">
              <HeadToHeadIcon />
              <div>
                <strong>Head-to-head intelligence</strong>
                <span>Real PKL results, raid and tackle form across 12 franchises.</span>
              </div>
            </div>
          </div>

          <div className="auth-trust">
            <ShieldIcon />
            <span>JWT-protected coaching workspace</span>
          </div>
        </div>
        <div className="auth-court" aria-hidden="true" />
      </section>

      <section className="auth-panel">
        <Outlet />
      </section>
    </div>
  );
}
