"use client";
import { usePathname } from "next/navigation";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
export default function SiteTelemetry() {
  const path = usePathname();
  if (path === "/train" || path.startsWith("/train/")) return null;
  return (
    <>
      <Analytics
        beforeSend={(event) =>
          new URL(event.url).pathname.match(/^\/train(?:\/|$)/) ? null : event
        }
      />
      <SpeedInsights />
    </>
  );
}
