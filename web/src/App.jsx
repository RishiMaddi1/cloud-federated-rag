import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import NavBar from "./components/NavBar";
import CloudPage from "./pages/CloudPage";
import LocalPage from "./pages/LocalPage";
import AboutPage from "./pages/AboutPage";

export default function App() {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <div className="site-shell">
      <NavBar theme={theme} onThemeChange={setTheme} />
      <main className="main-wrap page-main">
        <Routes>
          <Route path="/" element={<Navigate to="/cloud" replace />} />
          <Route path="/cloud" element={<CloudPage />} />
          <Route path="/local" element={<LocalPage />} />
          <Route path="/about" element={<AboutPage />} />
        </Routes>
      </main>
    </div>
  );
}
