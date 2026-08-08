import type { ReactNode } from "react";

/**
 * Admin CMS shell — internal content review and publishing.
 *
 * Shares the parent theme (it is the same professional voice) but runs wider
 * and denser: this surface is content tables and review queues, used on a
 * desktop by a reviewer approving AI-generated lessons.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div
      data-theme="parent"
      className="flex min-h-dvh flex-1 flex-col bg-background font-ui text-foreground"
    >
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-4 py-4">
        {children}
      </div>
    </div>
  );
}
