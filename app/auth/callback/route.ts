import { NextResponse } from "next/server";

export async function GET(request: Request) {
   // Supabase will handle the session in the URL fragment.
   return NextResponse.redirect("http://localhost:3000/dashboard");
}
