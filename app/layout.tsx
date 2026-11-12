import type { Metadata } from "next";
import {
  Caveat,
  Cormorant_Garamond,
  Dancing_Script,
  Geist,
  Geist_Mono,
  Inter,
} from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const dancingScript = Dancing_Script({
  variable: "--font-dancing",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mochi — A Daily Minute of Stillness",
  description:
    "Pause and be still with Mochi. A daily bio-sensing stillness companion that breathes, feels your pulse through your camera, and helps you slow down.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${caveat.variable} ${cormorant.variable} ${dancingScript.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
