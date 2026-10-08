import { toLocale } from "@kidlearn/i18n";
import { A11Y_BOOTSTRAP_SCRIPT } from "@kidlearn/ui";
import type { Metadata, Viewport } from "next";
import { Fredoka, Inter, Noto_Sans_Bengali, Nunito } from "next/font/google";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { Providers } from "@/shared/components/Providers";
import { LOCALE_COOKIE_NAME } from "@/shared/lib/locale";
import "./globals.css";

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  display: "swap",
});
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  display: "swap",
});
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});
// Not preloaded: only a Bangla page needs it, and the `unicode-range` in its
// `@font-face` still fetches it the moment a Bengali glyph is drawn.
const notoSansBengali = Noto_Sans_Bengali({
  variable: "--font-noto-bengali",
  subsets: ["bengali", "latin"],
  display: "swap",
  preload: false,
});

const fontVariables = [
  fredoka.variable,
  nunito.variable,
  inter.variable,
  notoSansBengali.variable,
].join(" ");

const SITE_NAME = "KidLearn";

export const metadata: Metadata = {
  // `||`, not `??`: a blank variable is a defined empty string, and `new URL("")` throws at module scope, failing every route.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000",
  ),
  title: SITE_NAME,
  description: "Playful, gamified early-learning for ages 3–5.",
  openGraph: {
    siteName: SITE_NAME,
    url: "/",
  },
};

// Primary devices are phones & tablets — cover the safe area on notched screens.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Every route is dynamic by decision: this layout reads the locale cookie.
export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  // Read on the server: detecting in the browser gives a Bangla visitor a flash of English and a hydration mismatch.
  const cookieStore = await cookies();
  const locale = toLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

  return (
    <html
      lang={locale}
      // The bootstrap script edits this element's classes before hydration, so the mismatch is expected.
      suppressHydrationWarning
      className={`${fontVariables} h-full antialiased`}
    >
      <body className="flex min-h-dvh flex-col bg-background font-body text-foreground">
        {/* Blocking and first, so high-contrast and dyslexia users never see a default-theme frame. */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a fixed, build-time string with no interpolated input — the only way to run before paint. */}
        <script dangerouslySetInnerHTML={{ __html: A11Y_BOOTSTRAP_SCRIPT }} />
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
