import React, { createContext, useContext, useEffect } from "react";
import { useSettingsStore, applyTheme } from "@/lib/stores/settings-store";

interface ThemeContextValue {
  isDark: false;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const fontSize = useSettingsStore((s) => s.settings.fontSize);

  useEffect(() => {
    applyTheme();
  }, [fontSize]);

  return (
    <ThemeContext.Provider value={{ isDark: false }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
