// frontend/lib/useTheme.ts
// Hook pour gérer le thème light/dark
// Utilisation: const { theme, toggleTheme, isDark } = useTheme();

"use client";

import { useState, useEffect } from "react";

export function useTheme() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    // Lire le thème sauvegardé
    const saved = localStorage.getItem("theme") as "dark" | "light" | null;
    const initial = saved || "dark";
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.setAttribute("data-theme", next);
  }

  return {
    theme,
    toggleTheme,
    isDark: theme === "dark",
    isLight: theme === "light",
  };
}


// ──────────────────────────────────────────────────────────────
// COMPOSANT BOUTON — copie ce composant dans chaque page/layout
// ──────────────────────────────────────────────────────────────
//
// import { useTheme } from "@/lib/useTheme";
//
// function ThemeToggle() {
//   const { isDark, toggleTheme } = useTheme();
//   return (
//     <button onClick={toggleTheme} className="theme-toggle" title="Changer le thème">
//       {isDark ? "☀️" : "🌙"}
//     </button>
//   );
// }
