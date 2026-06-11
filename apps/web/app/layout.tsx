import type { Metadata, Viewport } from "next";
import { Fredoka, Inter, JetBrains_Mono, Nunito } from "next/font/google";
import "./globals.css";

// Design-system fonts (document/design.md §3.1). Variable fonts → no weights.
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

export const metadata: Metadata = {
  title: "kidlearn",
  description: "Playful, gamified early-learning for ages 3–5.",
};

// Primary devices are phones & tablets — cover the safe area on notched screens.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="kid"
      className={`${fredoka.variable} ${nunito.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-dvh flex-col bg-background font-body text-foreground">
        {children}
      </body>
    </html>
  );
}
