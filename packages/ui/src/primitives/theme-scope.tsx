"use client";

import type * as React from "react";
import { createContext, useContext, useState } from "react";

export type Theme = "kid" | "parent";

const PortalContainerContext = createContext<HTMLElement | null>(null);

export interface ThemeScopeProps extends React.ComponentProps<"div"> {
  theme: Theme;
}

/**
 * Sets `data-theme` on what it wraps, and on what its descendants portal out.
 * A Radix portal mounts into `<body>` by default — outside every `data-theme`
 * wrapper, so a parent-surface dialog would wear `:root`'s kid tokens. The
 * primitives here portal into the nearest scope's element instead.
 */
function ThemeScope({ theme, children, ...props }: ThemeScopeProps) {
  // State, not a ref: the portals have to re-render once the element exists.
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  return (
    <div ref={setNode} data-theme={theme} {...props}>
      <PortalContainerContext.Provider value={node}>
        {children}
      </PortalContainerContext.Provider>
    </div>
  );
}

/** `undefined` outside a scope, which Radix reads as "portal into `<body>`". */
function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainerContext) ?? undefined;
}

export { ThemeScope, usePortalContainer };
