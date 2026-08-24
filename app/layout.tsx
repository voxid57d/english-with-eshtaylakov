import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const geistSans = Geist({
   variable: "--font-geist-sans",
   subsets: ["latin"],
});

const geistMono = Geist_Mono({
   variable: "--font-geist-mono",
   subsets: ["latin"],
});

export const metadata: Metadata = {
   metadataBase: new URL("https://eshtaylakov.uz"),
   title: "IELTS ZONE Amir Temur",
   description:
      "IELTS ZONE Amir Temur is an internal administration workspace for branch operations, staff tasks, KPI, shifts, and daily metrics.",
   icons: {
      icon: "/favicon.ico",
      shortcut: "/favicon.ico",
      apple: "/apple-touch-icon.png",
   },
   openGraph: {
      title: "IELTS ZONE Amir Temur",
      description:
         "Internal administration workspace for IELTS ZONE learning centers.",
      url: "/",
      siteName: "IELTS ZONE",
      locale: "en_US",
      type: "website",
   },
   twitter: {
      card: "summary",
      title: "IELTS ZONE Amir Temur",
      description:
         "Internal administration workspace for IELTS ZONE learning centers.",
   },
};

export default function RootLayout({
   children,
}: Readonly<{
   children: React.ReactNode;
}>) {
   return (
      <html lang="en">
         <body
            className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
            {children}
            <Analytics />
            <SpeedInsights />
         </body>
      </html>
   );
}
