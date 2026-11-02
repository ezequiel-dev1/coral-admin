"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTranslation } from "./i18n/LanguageProvider";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function getIsDark() {
  return document.documentElement.classList.contains("dark");
}

export function ThemeToggle() {
  const { t } = useTranslation();
  const isDark = useSyncExternalStore(subscribe, getIsDark, () => false);

  function toggleTheme() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  const label = isDark ? t("theme.toLight") : t("theme.toDark");

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      title={label}
      aria-label={label}
    >
      {isDark ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  );
}
