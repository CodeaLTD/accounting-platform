"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(STORAGE_KEY, theme);
}

export function ThemeToggle() {
  // Starts null so the first client render matches the server-rendered HTML
  // (which has no data-theme yet); the real value is read from the DOM right
  // after mount, by which point the inline script in layout.tsx (or the
  // system preference) has already set it.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current =
      (document.documentElement.dataset.theme as Theme | undefined) ??
      systemTheme();
    setTheme(current);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  if (theme === null) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Смяна на светла/тъмна тема"
      className="fixed top-4 left-4 z-50 cursor-pointer rounded-md border px-3 py-1 text-sm"
      style={{
        background: "var(--background)",
        color: "var(--foreground)",
        borderColor: "var(--foreground)",
      }}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
