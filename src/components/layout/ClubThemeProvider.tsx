"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface ThemeContextValue {
  primaryColor: string;
  secondaryColor: string;
  setColors: (primary: string, secondary: string) => void;
}

const ClubThemeContext = createContext<ThemeContextValue | null>(null);

export function ClubThemeProvider({
  children,
  initialPrimary,
  initialSecondary,
}: {
  children: ReactNode;
  initialPrimary: string;
  initialSecondary: string;
}) {
  const [primary, setPrimary] = useState(initialPrimary);
  const [secondary, setSecondary] = useState(initialSecondary);

  return (
    <ClubThemeContext.Provider
      value={{
        primaryColor: primary,
        secondaryColor: secondary,
        setColors: (p, s) => {
          setPrimary(p);
          setSecondary(s);
        },
      }}
    >
      <div
        className="min-h-screen flex"
        style={
          {
            "--color-brand-primary": primary,
            "--color-brand-secondary": secondary,
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    </ClubThemeContext.Provider>
  );
}

export function useClubTheme() {
  const ctx = useContext(ClubThemeContext);
  if (!ctx) throw new Error("useClubTheme must be used within ClubThemeProvider");
  return ctx;
}
