import { NavLink } from "react-router-dom";

const tabClass = ({ isActive }) => `page-tab${isActive ? " page-tab-active" : ""}`;

export default function NavBar({ theme, onThemeChange }) {
  return (
    <header className="top-nav">
      <div className="nav-left">
        <NavLink to="/cloud" className="brand-link">
          cloud-federated-rag
        </NavLink>
      </div>

      <nav className="nav-center" aria-label="Pages">
        <div className="page-tabs">
          <NavLink to="/cloud" className={tabClass} end>
            Cloud
          </NavLink>
          <NavLink to="/local" className={tabClass}>
            Local
          </NavLink>
          <NavLink to="/about" className={tabClass}>
            About
          </NavLink>
        </div>
      </nav>

      <div className="nav-right">
        <label className="theme-switcher" htmlFor="themeSelect">
          Theme
        </label>
        <select
          id="themeSelect"
          value={theme}
          onChange={(e) => onThemeChange(e.target.value)}
          className="select-input select-input--nav"
        >
          <option value="paper">Paper</option>
          <option value="dark">Dark</option>
          <option value="blue">Blue</option>
        </select>
      </div>
    </header>
  );
}
