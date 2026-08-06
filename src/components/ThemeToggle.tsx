"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem(STORAGE_KEY, theme);
}

export function ThemeToggle() {
  // Starts null so the first client render matches the server-rendered HTML
  // (which has no .dark class yet); the real value is read from the DOM
  // right after mount, by which point the inline script in layout.tsx (or
  // the system preference) has already set it.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current: Theme = document.documentElement.classList.contains("dark")
      ? "dark"
      : systemTheme();
    setTheme(current);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  if (theme === null) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={toggle}
      aria-label="Смяна на светла/тъмна тема"
      className="fixed top-4 right-4 z-50"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </Button>
  );
}
