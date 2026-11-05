"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/** Dark is the brand default; users can pick light or follow their device. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
