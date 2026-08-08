"use client";

import { createContext, useContext } from "react";

const PlatformBasePathContext = createContext<string | null>(null);

export function PlatformRouteProvider({
  basePath,
  children,
}: {
  basePath: string;
  children: React.ReactNode;
}) {
  return (
    <PlatformBasePathContext.Provider value={basePath}>
      {children}
    </PlatformBasePathContext.Provider>
  );
}

export function usePlatformBasePath(): string {
  const value = useContext(PlatformBasePathContext);
  if (!value) throw new Error("PLATFORM_ROUTE_CONTEXT_REQUIRED");
  return value;
}
