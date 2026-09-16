import { A11Y_BOOTSTRAP_SCRIPT } from "@kidlearn/ui";
import type { Metadata, Viewport } from "next";
import {
  Fredoka,
  Inter,
  JetBrains_Mono,
  Noto_Sans_Bengali,
  Nunito,
} from "next/font/google";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { Providers } from "@/shared/components/Providers";
import { LOCALE_COOKIE_NAME, toLocale } from "@/shared/lib/locale";
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
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

const notoSansBengali = Noto_Sans_Bengali({
  variable: "--font-noto-bengali",
  subsets: ["bengali", "latin"],
  display: "swap",
});

const fontVariables = [
  fredoka.variable,
  nunito.variable,
  inter.variable,
  jetbrainsMono.variable,
  notoSansBengali.variable,
].join(" ");

const SITE_NAME = "KidLearn";

export const metadata: Metadata = {
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const cookieStore = await cookies();
  const locale = toLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${fontVariables} h-full antialiased`}
    >
      <body className="flex min-h-dvh flex-col bg-background font-body text-foreground">
        {/* Blocking and first, so a user who needs high contrast or a dyslexia
            font never sees a frame of the default theme (NFR-A11Y-03..05). */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a fixed, build-time string with no interpolated input — the only way to run before paint. */}
        <script dangerouslySetInnerHTML={{ __html: A11Y_BOOTSTRAP_SCRIPT }} />
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
