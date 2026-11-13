import { NextResponse } from "next/server";
import { erpJsonError } from "@/lib/erp";
import { getErpPermissions, requireErpPermission } from "@/lib/erpAuth";
import { statisticMonthWindow, validateStatisticCategory, validateStatisticReading, type StatisticCategory, type StatisticReading } from "@/lib/statistics";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failure(error: unknown) {
   const { message, status } = erpJsonError(error, "Could not access statistics.");
   return NextResponse.json({ error: message }, { status });
}

function databaseError(error: { code?: string }) {
   if (error.code === "23505") return new Error("That category name already exists.");
   if (error.code === "P0002") return new Error("This entry no longer exists. Reload to see the latest entries.");
   if (error.code === "23503") return new Error("A category in this entry was deleted. Reload and try again.");
   if (["42P01", "42703", "PGRST200", "PGRST202", "PGRST204", "PGRST205", "42883"].includes(error.code || "")) return new Error("Statistics setup is required. Run supabase/statistics_schema.sql and then supabase/statistics_readings.sql in the Supabase SQL editor.");
   return new Error("Could not access statistics. Please retry; your unsaved edits are still available.");
}

export async function GET(req: Request) {
   try {
      const { staff } = await requireErpPermission(req, "statistics", "view");
      const { from, to } = statisticMonthWindow(new URL(req.url).searchParams.get("month") || "");
      const permissions = await getErpPermissions(staff.role);
      const categories: StatisticCategory[] = [];
      for (let offset = 0; ; offset += 1000) {
         const result = await supabaseAdmin.from("statistics_categories").select("id, name, color, unit")
            .order("created_at").order("id").range(offset, offset + 999);
         if (result.error) throw databaseError(result.error);
         categories.push(...result.data);
         if (result.data.length < 1000) break;
      }
      const readings: StatisticReading[] = [];
      for (let offset = 0; ; offset += 1000) {
         const result = await supabaseAdmin.from("statistics_readings").select("id, recorded_at, note, statistics_reading_values(category_id, value)")
            .gte("recorded_at", from).lt("recorded_at", to)
            .order("recorded_at").order("id").range(offset, offset + 999);
         if (result.error) throw databaseError(result.error);
         readings.push(...result.data.map((row: { id: string; recorded_at: string; note: string | null; statistics_reading_values: { category_id: string; value: number | string }[] }) => ({
            id: row.id, recorded_at: new Date(row.recorded_at).toISOString(), note: row.note,
            values: Object.fromEntries(row.statistics_reading_values.map((item) => [item.category_id, Number(item.value)])),
         })));
         if (result.data.length < 1000) break;
      }
      return NextResponse.json({ categories, readings, canManage: permissions.statistics.includes("manage") });
   } catch (error) { return failure(error); }
}

export async function POST(req: Request) {
   try {
      const { user } = await requireErpPermission(req, "statistics", "manage");
      const body = await req.json();
      if (body?.action === "deleteCategory") {
         if (typeof body.id !== "string" || !uuid.test(body.id)) throw new Error("Choose a valid category.");
         const { error } = await supabaseAdmin.rpc("delete_statistics_category", { target_category_id: body.id });
         if (error) throw databaseError(error);
         return NextResponse.json({ ok: true });
      }
      if (body?.action === "saveReading") {
         const reading = validateStatisticReading(body.reading);
         const { data, error } = await supabaseAdmin.rpc("save_statistics_reading", { reading, actor: user.id });
         if (error) throw databaseError(error);
         return NextResponse.json({ id: data });
      }
      if (body?.action === "deleteReading") {
         if (typeof body.id !== "string" || !uuid.test(body.id)) throw new Error("Choose a valid entry.");
         const { data, error } = await supabaseAdmin.rpc("delete_statistics_reading", { target_reading_id: body.id });
         if (error) throw databaseError(error);
         if (!data) throw new Error("This entry no longer exists. Reload to see the latest entries.");
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
