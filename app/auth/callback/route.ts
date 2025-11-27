import { NextResponse } from "next/server";

export async function GET(request: Request) {
   // Keep the same origin (localhost in dev, Vercel in prod)
   const url = new URL("/dashboard", request.url);
   return NextResponse.redirect(url);
}
