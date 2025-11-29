import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
   // Base URL of your site, used to build absolute links
   metadataBase: new URL("https://eshtaylakov.uz"),

   // Normal title + description (also shown in search results)
   title: "Talk Time",
   description:
      "Talk Time is an interactive English-learning platform offering vocabulary practice, reading and listening exercises, personalized decks, progress tracking, and IELTS CDI mock tests to help you prepare with confidence.",

   // 👇 Open Graph = what Telegram / Facebook use for link previews
   openGraph: {
      title: "Talk Time",
      description:
         "Improve your English with interactive vocabulary, reading, listening, and IELTS CDI mock tests.",
      url: "/",
      siteName: "Talk Time",
      images: [
         {
            // Path to the image in the /public folder
            url: "/talktime-og.png",
            width: 1200,
            height: 630,
            alt: "Talk Time - English learning platform",
         },
      ],
      locale: "en_US",
      type: "website",
   },

   // 👇 Extra info for Twitter/X previews (also used by some other apps)
   twitter: {
      card: "summary_large_image",
      title: "Talk Time",
      description:
         "Interactive English-learning platform with vocabulary, reading, listening, and IELTS CDI mock tests.",
      images: ["/talktime-og.png"],
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
         </body>
      </html>
   );
}
