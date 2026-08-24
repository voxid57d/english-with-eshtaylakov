import { NextResponse } from "next/server";
import { cleanString, erpJsonError, nullableString, type Branch } from "@/lib/erp";
import { requireErpPermission } from "@/lib/erpAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function toBranch(row: Branch) {
   return {
      id: row.id,
      name: row.name,
      address: row.address,
      phone: row.phone,
      active: row.active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
   };
}

function jsonError(error: unknown, fallback: string) {
   const { message, status } = erpJsonError(error, fallback);
   return NextResponse.json({ error: message }, { status });
}

export async function GET(req: Request) {
   try {
      await requireErpPermission(req, "branches", "view");

      const { data, error } = await supabaseAdmin
         .from("branches")
         .select("id, name, address, phone, active, created_at, updated_at")
         .order("active", { ascending: false })
         .order("name", { ascending: true });

      if (error) {
         throw new Error("Failed to load branches. Apply supabase/erp_core_schema.sql first.");
      }

      return NextResponse.json({
         branches: ((data || []) as Branch[]).map(toBranch),
      });
   } catch (error) {
      return jsonError(error, "Failed to load branches.");
   }
}

export async function POST(req: Request) {
   try {
      await requireErpPermission(req, "branches", "manage");

      const body = await req.json();
      const name = cleanString(body?.name);

      if (!name) {
         throw new Error("Branch name is required.");
      }

      const { data, error } = await supabaseAdmin
         .from("branches")
         .insert({
            name,
            address: nullableString(body?.address),
            phone: nullableString(body?.phone),
            active: body?.active !== false,
         })
         .select("id, name, address, phone, active, created_at, updated_at")
         .single();

      if (error || !data) {
         throw new Error("Failed to create branch. Apply supabase/erp_core_schema.sql first.");
      }

      return NextResponse.json({ branch: toBranch(data as Branch) });
   } catch (error) {
      return jsonError(error, "Failed to create branch.");
   }
}

export async function PATCH(req: Request) {
   try {
      await requireErpPermission(req, "branches", "manage");

      const body = await req.json();
      const id = cleanString(body?.id);
      const name = cleanString(body?.name);

      if (!id) {
         throw new Error("Branch ID is required.");
      }

      if (!name) {
         throw new Error("Branch name is required.");
      }

      const { data, error } = await supabaseAdmin
         .from("branches")
         .update({
            name,
            address: nullableString(body?.address),
            phone: nullableString(body?.phone),
            active: body?.active !== false,
         })
         .eq("id", id)
         .select("id, name, address, phone, active, created_at, updated_at")
         .single();

      if (error || !data) {
         throw new Error("Failed to update branch.");
      }

      return NextResponse.json({ branch: toBranch(data as Branch) });
   } catch (error) {
      return jsonError(error, "Failed to update branch.");
   }
}
