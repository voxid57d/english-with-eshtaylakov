import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ProfileRow = {
   id: string;
   username: string | null;
   is_premium: boolean | null;
};

function jsonError(error: unknown, fallback: string) {
   const message = error instanceof Error ? error.message : fallback;
   const status =
      message === "Missing bearer token." || message === "Unauthorized."
         ? 401
         : message === "Forbidden."
           ? 403
           : 400;

   return NextResponse.json({ error: message || fallback }, { status });
}

export async function GET(req: Request) {
   try {
      await requireAdminUser(req);

      const { data: authData, error: authError } =
         await supabaseAdmin.auth.admin.listUsers({
            page: 1,
            perPage: 1000,
         });

      if (authError) {
         throw new Error("Failed to load admin users.");
      }

      const authUsers = authData.users || [];
      const userIds = authUsers.map((user) => user.id);

      let profileMap = new Map<string, ProfileRow>();
      if (userIds.length > 0) {
         const { data: profiles, error: profilesError } = await supabaseAdmin
            .from("profiles")
            .select("id, username, is_premium")
            .in("id", userIds);

         if (profilesError) {
            throw new Error("Failed to load admin users.");
         }

         profileMap = new Map(
            ((profiles || []) as ProfileRow[]).map((profile) => [profile.id, profile])
         );
      }

      const users = authUsers
         .map((user) => {
            const profile = profileMap.get(user.id);

            return {
               id: user.id,
               email: user.email ?? null,
               username: profile?.username?.trim() || null,
               isPremium: profile?.is_premium === true,
               createdAt: user.created_at ?? null,
               lastSignInAt: user.last_sign_in_at ?? null,
            };
         })
         .sort((a, b) => {
            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bTime - aTime;
         });

      return NextResponse.json({ users });
   } catch (error) {
      return jsonError(error, "Failed to load admin users.");
   }
}

export async function PATCH(req: Request) {
   try {
      await requireAdminUser(req);

      const body = await req.json();
      const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
      const isPremium = body?.isPremium === true;

      if (!userId) {
         throw new Error("User ID is required.");
      }

      const { data, error } = await supabaseAdmin
         .from("profiles")
         .upsert(
            {
               id: userId,
               is_premium: isPremium,
            },
            {
               onConflict: "id",
            }
         )
         .select("id, username, is_premium")
         .single();

      if (error || !data) {
         throw new Error("Failed to update premium status.");
      }

      return NextResponse.json({
         user: {
            id: data.id,
            username: data.username?.trim() || null,
            isPremium: data.is_premium === true,
         },
      });
   } catch (error) {
      return jsonError(error, "Failed to update premium status.");
   }
}
