import { Link, useLocation } from "react-router-dom";
import { BoltIcon, MenuIcon } from "./Icons.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const titles = {
  "/": ["Dashboard", "Season overview and model intelligence"],
  "/setup": ["Match Setup", "Select teams and build the starting sevens"],
  "/players": ["Player Management", "Rosters, scoring form and filters"],
  "/live": ["Live Match", "Score, probability and in-match decisions"],
  "/analytics": ["Analytics", "Player performance and team comparison"],
  "/head-to-head": ["Head-to-Head", "Historical record between two franchises"],
  "/matches": ["Match History", "Saved reports and PKL fixtures"],
  "/settings": ["Settings", "Account, model and dataset status"],
};

export default function Topbar({ onOpenMenu }) {
  const location = useLocation();
  const { user } = useAuth();

  const title = location.pathname.startsWith("/matches/")
    ? ["Match Report", "Full match breakdown and downloads"]
    : titles[location.pathname] || ["Dashboard", "Kabaddi coach intelligence"];

  return (
    <header className="topbar">
      <button type="button" className="icon-button menu-button" onClick={onOpenMenu}>
        <MenuIcon />
        <span className="sr-only">Open navigation</span>
      </button>

      <div className="topbar-heading">
        <span className="topbar-eyebrow">Pro Kabaddi League</span>
        <h1 className="topbar-title">{title[0]}</h1>
        <span className="topbar-sub">{title[1]}</span>
      </div>

      <div className="topbar-actions">
        <Link to="/setup" className="btn btn-secondary btn-sm topbar-cta">
          <BoltIcon width={16} height={16} />
          New match
        </Link>
        <div className="topbar-user" title={user?.email}>
          <span className="avatar avatar-sm">
            {(user?.name || "Coach")
              .split(" ")
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0]?.toUpperCase())
              .join("")}
          </span>
        </div>
      </div>
    </header>
  );
}
