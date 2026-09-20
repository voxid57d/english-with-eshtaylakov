import { NextResponse } from "next/server";
import { erpJsonError } from "@/lib/erp";
import { getErpPermissions, requireErpPermission } from "@/lib/erpAuth";
import { monthDays, previousDate } from "@/lib/marketingMetrics";
import { validateStatisticCategory, validateStatisticChanges, type StatisticCategory, type StatisticEntry } from "@/lib/statistics";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function failure(error: unknown) {
   const { message, status } = erpJsonError(error, "Could not access statistics.");
   return NextResponse.json({ error: message }, { status });
}

function databaseError(error: { code?: string }) {
   if (error.code === "23505") return new Error("That category name already exists.");
   if (["42P01", "42703", "PGRST202", "PGRST204", "PGRST205", "42883"].includes(error.code || "")) return new Error("Statistics setup is required. Run supabase/statistics_schema.sql in the Supabase SQL editor.");
   return new Error("Could not access statistics. Please retry; your unsaved edits are still available.");
}

export async function GET(req: Request) {
   try {
      const { staff } = await requireErpPermission(req, "statistics", "view");
      const days = monthDays(new URL(req.url).searchParams.get("month") || "");
      const permissions = await getErpPermissions(staff.role);
      const categories: StatisticCategory[] = [];
      for (let offset = 0; ; offset += 1000) {
         const result = await supabaseAdmin.from("statistics_categories").select("id, name, color, unit")
            .order("created_at").order("id").range(offset, offset + 999);
         if (result.error) throw databaseError(result.error);
         categories.push(...result.data);
         if (result.data.length < 1000) break;
      }
      const entries: StatisticEntry[] = [];
      for (let offset = 0; ; offset += 1000) {
         const result = await supabaseAdmin.from("statistics_entries").select("category_id, entry_date, value")
            .gte("entry_date", previousDate(days[0])).lte("entry_date", days[days.length - 1])
            .order("entry_date").order("category_id").range(offset, offset + 999);
         if (result.error) throw databaseError(result.error);
         entries.push(...result.data.map((entry) => ({ ...entry, value: Number(entry.value) })));
         if (result.data.length < 1000) break;
      }
      return NextResponse.json({ categories, entries, canManage: permissions.statistics.includes("manage") });
   } catch (error) { return failure(error); }
}

export async function POST(req: Request) {
   try {
      const { user } = await requireErpPermission(req, "statistics", "manage");
      const body = await req.json();
      if (body?.action === "deleteCategory") {
         if (typeof body.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)) throw new Error("Choose a valid category.");
         const { error } = await supabaseAdmin.rpc("delete_statistics_category", { target_category_id: body.id });
         if (error) throw databaseError(error);
         return NextResponse.json({ ok: true });
      }
      if (body?.action === "saveEntries") {
         const changes = validateStatisticChanges(body.changes);
         const { error } = await supabaseAdmin.rpc("save_statistics_entries", { changes, actor: user.id });
         if (error) throw databaseError(error);
         return NextResponse.json({ ok: true });
      }
      if (body?.action !== "category") throw new Error("Choose a valid statistics action.");
      const payload = validateStatisticCategory(body);
      const query = body.id ? supabaseAdmin.from("statistics_categories").update(payload).eq("id", body.id) : supabaseAdmin.from("statistics_categories").insert(payload);
      const { data, error } = await query.select("id, name, color, unit").single();
      if (error) throw databaseError(error);
      return NextResponse.json({ category: data });
   } catch (error) { return failure(error); }
}
