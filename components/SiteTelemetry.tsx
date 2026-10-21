"use client";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
export default function SiteTelemetry() {
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
