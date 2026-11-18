import { NavLink } from "react-router-dom";
import logo from "../assets/logo.svg";
import { useAuth } from "../context/AuthContext.jsx";
import {
  AnalyticsIcon,
  CloseIcon,
  DashboardIcon,
  HeadToHeadIcon,
  HistoryIcon,
  LiveIcon,
  LogoutIcon,
  PlayersIcon,
  SettingsIcon,
  SetupIcon,
} from "./Icons.jsx";

const navigation = [
  { to: "/", label: "Dashboard", icon: DashboardIcon },
  { to: "/setup", label: "Match Setup", icon: SetupIcon },
  { to: "/players", label: "Player Management", icon: PlayersIcon },
  { to: "/live", label: "Live Match", icon: LiveIcon, live: true },
  { to: "/analytics", label: "Analytics", icon: AnalyticsIcon },
  { to: "/head-to-head", label: "Head-to-Head", icon: HeadToHeadIcon },
  { to: "/matches", label: "Match History", icon: HistoryIcon },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth();

  return (
    <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
      <div className="sidebar-brand">
        <img src={logo} alt="" width="38" height="38" />
        <div className="brand-text">
          <span className="brand-name">KABADDI COACH</span>
          <span className="brand-sub">INTELLIGENCE</span>
        </div>
        <button type="button" className="icon-button sidebar-close" onClick={onClose}>
          <CloseIcon />
          <span className="sr-only">Close navigation</span>
        </button>
      </div>

      <div className="nav-section-label">Workspace</div>
      <nav className="nav">
        {navigation.map(({ to, label, icon: Icon, live }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
          >
            <Icon className="nav-icon" />
            <span>{label}</span>
            {live && <span className="nav-live-dot" aria-hidden="true" />}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="user-chip">
          <div className="avatar">{initials(user?.name) || "KC"}</div>
          <div className="user-meta">
            <strong>{user?.name || "Coach"}</strong>
            <span>{user?.email || ""}</span>
          </div>
          <button
            type="button"
            className="icon-button"
            title="Sign out"
            onClick={logout}
          >
            <LogoutIcon />
          </button>
        </div>
        <div className="sidebar-version">
          <span className="status-dot" />
          MERN + FastAPI · v1.0
        </div>
      </div>
    </aside>
  );
}
