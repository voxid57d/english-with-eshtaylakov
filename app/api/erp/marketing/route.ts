import { NextResponse } from "next/server";
import { erpJsonError } from "@/lib/erp";
import { getErpPermissions, requireErpPermission } from "@/lib/erpAuth";
import { monthDays, parseProfileLink, validateChanges, type MarketingEntry, type MarketingProfileLink } from "@/lib/marketingMetrics";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { validatePlatformLogo } from "@/lib/marketingLogo";

function failure(error: unknown) {
   const { message, status } = erpJsonError(error, "Could not save marketing metrics.");
   return NextResponse.json({ error: message }, { status });
}

function databaseError(error: { code?: string }) {
   if (error.code === "23505") return new Error("That name already exists. Choose another name.");
   if (["42P01", "42703", "PGRST204", "PGRST205", "PGRST202", "42883"].includes(error.code || "")) return new Error("Marketing setup is required. Run supabase/marketing_metrics_schema.sql in the Supabase SQL editor.");
   return new Error("Could not update marketing data. Please retry; your edits are still available.");
}

export async function GET(req: Request) {
   try {
      const { staff } = await requireErpPermission(req, "marketing", "view");
      const days = monthDays(new URL(req.url).searchParams.get("month") || "");
      const [centres, platforms, permissions] = await Promise.all([
         supabaseAdmin.from("marketing_centres").select("id, name, color").order("created_at").order("id"),
         supabaseAdmin.from("marketing_platforms").select("id, name, logo_data_url").order("created_at").order("id"),
         getErpPermissions(staff.role),
      ]);
      if (centres.error || platforms.error) throw databaseError((centres.error || platforms.error)!);
      const entries: MarketingEntry[] = [];
      // Supabase caps individual responses; fetch every page of the monthly sheet.
      for (let offset = 0; ; offset += 1000) {
         const result = await supabaseAdmin.from("marketing_entries")
            .select("centre_id, platform_id, entry_date, subscribers")
            .gte("entry_date", days[0]).lte("entry_date", days[days.length - 1])
            .order("entry_date").order("centre_id").order("platform_id").range(offset, offset + 999);
         if (result.error) throw databaseError(result.error);
         entries.push(...(result.data || []));
         if (result.data.length < 1000) break;
      }
      const profileLinks: MarketingProfileLink[] = [];
      for (let offset = 0; ; offset += 1000) {
         const result = await supabaseAdmin.from("marketing_profile_links")
            .select("centre_id, platform_id, url").order("centre_id").order("platform_id").range(offset, offset + 999);
         if (result.error) throw databaseError(result.error);
         profileLinks.push(...result.data);
         if (result.data.length < 1000) break;
      }
      return NextResponse.json({ centres: centres.data, platforms: platforms.data, entries, profileLinks, canManage: permissions.marketing.includes("manage") });
   } catch (error) { return failure(error); }
}

export async function POST(req: Request) {
   try {
      const { user } = await requireErpPermission(req, "marketing", "manage");
      const body = await req.json();
      if (body?.action === "profileLink") {
         const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
         if (typeof body.centre_id !== "string" || typeof body.platform_id !== "string" || !uuid.test(body.centre_id) || !uuid.test(body.platform_id)) throw new Error("Choose a valid centre and platform.");
         const url = parseProfileLink(body.url);
         const { data, error } = await supabaseAdmin.from("marketing_profile_links")
            .upsert({ centre_id: body.centre_id, platform_id: body.platform_id, url }, { onConflict: "centre_id,platform_id" })
            .select("centre_id, platform_id, url").single();
         if (error) throw databaseError(error);
         return NextResponse.json({ profileLink: data });
      }
      if (body?.action === "saveEntries") {
         const changes = validateChanges(body.changes);
         const { error } = await supabaseAdmin.rpc("save_marketing_entries", { changes, actor: user.id });
         if (error) throw databaseError(error);
         return NextResponse.json({ ok: true });
      }
      if (body?.action !== "centre" && body?.action !== "platform") throw new Error("Choose a valid marketing action.");
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name || name.length > (body.action === "centre" ? 80 : 60)) throw new Error("Enter a name within the allowed length.");
      const payload: { name: string; color?: string; logo_data_url?: string | null } = { name };
      if (body.action === "platform" && Object.hasOwn(body, "logo_data_url")) payload.logo_data_url = validatePlatformLogo(body.logo_data_url);
      if (body.action === "centre") {
         if (typeof body.color !== "string" || !/^#[0-9a-f]{6}$/i.test(body.color)) throw new Error("Choose a valid centre color.");
         payload.color = body.color;
      }
      const table = body.action === "centre" ? "marketing_centres" : "marketing_platforms";
      if (body.id !== undefined && (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id))) throw new Error("Choose a valid record.");
      const query = body.id ? supabaseAdmin.from(table).update(payload).eq("id", body.id) : supabaseAdmin.from(table).insert(payload);
      const { data, error } = await query.select().single();
      if (error) throw databaseError(error);
      return NextResponse.json({ record: data });
   } catch (error) { return failure(error); }
}
