import { NextResponse } from "next/server";
import { erpJsonError } from "@/lib/erp";
import { requireErpStaff } from "@/lib/erpAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function jsonError(error: unknown, fallback: string) {
   const { message, status } = erpJsonError(error, fallback);
   return NextResponse.json({ error: message }, { status });
}

export async function GET(req: Request) {
   try {
      const { staff } = await requireErpStaff(req);

      const { data, error } = await supabaseAdmin
         .from("staff_profiles")
         .select("user_id, full_name, role, primary_branch_id, telegram_username, phone, notes, active")
         .eq("user_id", staff.userId)
         .single();

      if (error || !data) {
         throw new Error("Failed to load staff profile.");
      }

      return NextResponse.json({ profile: data });
   } catch (error) {
      return jsonError(error, "Failed to load staff profile.");
   }
}

export async function PATCH(req: Request) {
   try {
      const { staff } = await requireErpStaff(req);
      const body = await req.json();

      const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
      const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
      const telegramUsername =
         typeof body?.telegramUsername === "string" ? body.telegramUsername.trim() : "";

      if (fullName.length < 2) {
         throw new Error("Full name must be at least 2 characters.");
      }

      const { data, error } = await supabaseAdmin
         .from("staff_profiles")
         .update({
            full_name: fullName,
            phone: phone || null,
            telegram_username: telegramUsername.replace(/^@/, "") || null,
         })
         .eq("user_id", staff.userId)
         .select("user_id, full_name, role, primary_branch_id, telegram_username, phone, notes, active")
         .single();

      if (error || !data) {
         throw new Error("Failed to update staff profile.");
      }

      return NextResponse.json({ profile: data });
   } catch (error) {
      return jsonError(error, "Failed to update staff profile.");
   }
}
