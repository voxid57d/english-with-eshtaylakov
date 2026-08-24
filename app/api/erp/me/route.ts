import { NextResponse } from "next/server";
import { erpJsonError } from "@/lib/erp";
import { getErpPermissions, requireErpStaff } from "@/lib/erpAuth";

function jsonError(error: unknown, fallback: string) {
   const { message, status } = erpJsonError(error, fallback);
   return NextResponse.json({ error: message }, { status });
}

export async function GET(req: Request) {
   try {
      const { staff } = await requireErpStaff(req);

      return NextResponse.json({
         staff,
         permissions: await getErpPermissions(staff.role),
      });
   } catch (error) {
      return jsonError(error, "Failed to load Amir Temur profile.");
   }
}
