export default function NavBar({ theme, onThemeChange }) {
  const links = [
    ["home", "Home"],
    ["demo", "Demo"],
    ["setup", "Setup"],
    ["faq", "FAQ"],
  ];

  return (
    <header className="top-nav">
      <div className="nav-left">
        <a href="#home" className="brand-link">cloud-federated-rag</a>
      </div>
      <div className="nav-center">
        <label className="theme-switcher" htmlFor="themeSelect">Theme</label>
        <select
          id="themeSelect"
          value={theme}
          onChange={(e) => onThemeChange(e.target.value)}
          className="select-input"
        >
          <option value="paper">Paper</option>
          <option value="dark">Dark</option>
          <option value="blue">Blue</option>
        </select>
      </div>
      <nav className="nav-right" aria-label="Main">
        {links.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="nav-link">{label}</a>
        ))}
      </nav>
    </header>
  );
}
