"use client";

import { DependencyList, EffectCallback, useEffect } from "react";

export function useDebouncedEffect(effect: EffectCallback, dependencies: DependencyList, delay = 500): void {
  useEffect(() => {
    const timeout = window.setTimeout(effect, delay);
    return () => window.clearTimeout(timeout);
    // The caller intentionally controls the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, delay]);
}
