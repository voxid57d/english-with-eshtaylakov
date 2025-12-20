import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type TelegramPayload = {
   id: number;
   first_name?: string;
   last_name?: string;
   username?: string;
   photo_url?: string;
   auth_date: number;
   hash: string;
};

function safeCompareHex(a: string, b: string) {
   const aBuf = Buffer.from(a, "hex");
   const bBuf = Buffer.from(b, "hex");
   if (aBuf.length !== bBuf.length) return false;
   return crypto.timingSafeEqual(aBuf, bBuf);
}

function verifyTelegram(payload: TelegramPayload, botToken: string) {
   // Telegram tells us "hash" is the signature, so we exclude it from the signed data
   const { hash, ...data } = payload;

   // Build the "data-check-string": key=value lines sorted alphabetically
   const dataCheckString = Object.keys(data)
      .sort()
      .map((k) => `${k}=${(data as any)[k]}`)
      .join("\n");

   // secret_key = SHA256(bot_token)
   const secretKey = crypto.createHash("sha256").update(botToken).digest();

   // expected_hash = HMAC_SHA256(dataCheckString, secret_key)
   const expectedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

   return safeCompareHex(expectedHash, hash);
}

export async function POST(req: Request) {
   const botToken = process.env.TELEGRAM_BOT_TOKEN;
   if (!botToken) {
      return NextResponse.json(
         { error: "Missing TELEGRAM_BOT_TOKEN on server" },
         { status: 500 }
      );
   }

   const siteUrl =
      process.env.SITE_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "http://localhost:3000";

   let payload: TelegramPayload;
   try {
      payload = await req.json();
   } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
   }

   // Anti-replay: only accept logins from the last 5 minutes
   const now = Math.floor(Date.now() / 1000);
   if (!payload.auth_date || now - payload.auth_date > 300) {
      return NextResponse.json({ error: "Login expired" }, { status: 401 });
   }

   // Verify signature from Telegram
   if (!verifyTelegram(payload, botToken)) {
      return NextResponse.json(
         { error: "Invalid Telegram signature" },
         { status: 401 }
      );
   }

   const telegramId = payload.id;

   // "Separate accounts" strategy: pseudo email per telegram user
   const pseudoEmail = `tg-${telegramId}@eshtaylakov.uz`;

   // Check if this telegram_id already mapped
   const { data: existing } = await supabaseAdmin
      .from("telegram_accounts")
      .select("user_id")
      .eq("telegram_id", telegramId)
      .maybeSingle();

   if (!existing) {
      // Create new Supabase Auth user
      const password = crypto.randomBytes(24).toString("base64url");

      const { data: created, error: createErr } =
         await supabaseAdmin.auth.admin.createUser({
            email: pseudoEmail,
            password,
            email_confirm: true,
            user_metadata: {
               signup_method: "telegram",
               telegram_id: telegramId,
            },
         });

      if (createErr || !created.user) {
         return NextResponse.json(
            { error: createErr?.message ?? "Failed to create user" },
            { status: 500 }
         );
      }

      // Insert mapping
      const { error: mapErr } = await supabaseAdmin
         .from("telegram_accounts")
         .insert({
            telegram_id: telegramId,
            user_id: created.user.id,
            username: payload.username ?? null,
            first_name: payload.first_name ?? null,
            last_name: payload.last_name ?? null,
            photo_url: payload.photo_url ?? null,
         });

      if (mapErr) {
         return NextResponse.json({ error: mapErr.message }, { status: 500 });
      }
   }

   // Generate an instant login link that logs them in (no email sent)
   const { data: link, error: linkErr } =
      await supabaseAdmin.auth.admin.generateLink({
         type: "magiclink",
         email: pseudoEmail,
         options: {
            redirectTo: `${siteUrl}/dashboard`,
         },
      });

   if (linkErr || !link?.properties?.action_link) {
      return NextResponse.json(
         { error: linkErr?.message ?? "Failed to generate login link" },
         { status: 500 }
      );
   }

   // Frontend will redirect to this link
   return NextResponse.json({ action_link: link.properties.action_link });
}
