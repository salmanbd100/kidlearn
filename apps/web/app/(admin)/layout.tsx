import type { ReactNode } from "react";

/** Admin CMS shell — internal content review and publishing. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div
      data-theme="parent"
      // From `md` up this is exactly one viewport tall and the document never
      // scrolls — the rail stays put while a long list moves, so the scroll
      // belongs to the content pane in `AdminShell`. Below `md` the rail is a
      // top bar and the page scrolls normally: pinning it there would spend a
      // third of a phone viewport on navigation.
      //
      // There is no vertical padding at any width. It used to wrap a child that
      // was already `dvh` tall, which scrolled the whole page by exactly that
      // padding with nothing to reveal.
      className="flex min-h-dvh flex-col bg-background font-ui text-foreground md:h-dvh md:overflow-hidden"
    >
      {/* The `md` scroll rule is a safety net for the shell-less pages in this
          group (the login screen), which own their height and must still scroll
          on a short window. The shell itself can never overflow it. */}
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col md:min-h-0 md:overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
