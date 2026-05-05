// supabase/functions/notify-menu-change/index.ts
// Deploy with: supabase functions deploy notify-menu-change
//
// This function is called by the React app (superadmin only)
// whenever a menu day is saved. It emails all parents with
// the updated menu for that date.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL     = Deno.env.get("FROM_EMAIL") ?? "lunch@yourdomain.com";
const APP_NAME       = "Lunchbox by Chumpys Kitchen";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { date, items } = await req.json();
    // items: [{ name: string, price: number }, ...]
    // date:  "YYYY-MM-DD"

    if (!date || !items?.length) {
      return new Response(JSON.stringify({ error: "date and items required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role key so we can read all parents regardless of RLS
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Fetch all parent emails
    const { data: parents, error } = await supabase
      .from("profiles")
      .select("name, id")
      .eq("role", "parent");

    if (error) throw error;
    if (!parents?.length) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch auth emails for parents (need service role for this)
    const { data: { users }, error: authErr } = await supabase.auth.admin.listUsers();
    if (authErr) throw authErr;

    const parentIds = new Set(parents.map((p) => p.id));
    const parentUsers = users.filter((u) => parentIds.has(u.id));

    // Format date nicely
    const displayDate = new Date(date + "T12:00:00").toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric",
    });

    // Build menu HTML list
    const menuHtml = items
      .map((it: { name: string }) => `<li style="padding:6px 0;border-bottom:1px solid #f0e8e0;">${it.name}</li>`)
      .join("");

    // Send one email per parent (Resend batch would be better for large lists)
    let sent = 0;
    for (const user of parentUsers) {
      const parent = parents.find((p) => p.id === user.id);
      const firstName = parent?.name?.split(" ")[0] ?? "there";

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${APP_NAME} <${FROM_EMAIL}>`,
          to: [user.email],
          subject: `📋 Menu Updated — ${displayDate}`,
          html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#FFF8F3;margin:0;padding:0;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(255,107,53,0.10);border:1.5px solid #F0E8E0;">
    <div style="background:#FF6B35;padding:28px 32px;">
      <div style="font-size:28px;margin-bottom:6px;">🍱</div>
      <div style="color:white;font-size:22px;font-weight:800;letter-spacing:-0.5px;">Lunchbox</div>
      <div style="color:rgba(255,255,255,0.85);font-size:12px;margin-top:2px;">by Chumpys Kitchen</div>
      <div style="color:rgba(255,255,255,0.85);font-size:14px;margin-top:8px;">Menu Update</div>
    </div>
    <div style="padding:28px 32px;">
      <p style="font-size:15px;color:#1A1A2E;">Hi ${firstName},</p>
      <p style="font-size:15px;color:#5A5A7A;line-height:1.6;">
        The lunch menu for <strong style="color:#1A1A2E;">${displayDate}</strong> has been updated.
        Here's what's available:
      </p>
      <ul style="list-style:none;padding:0;margin:20px 0;background:#FFF8F3;border-radius:10px;padding:8px 16px;">
        ${menuHtml}
      </ul>
      <p style="font-size:13px;color:#9898B0;line-height:1.6;">
        Remember — orders must be placed before <strong>8:00 AM</strong> on the day of service.
      </p>
      <div style="text-align:center;margin-top:24px;">
        <a href="${Deno.env.get("APP_URL") ?? "#"}"
           style="background:#FF6B35;color:white;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">
          Order Now →
        </a>
      </div>
    </div>
    <div style="background:#FFF0E6;padding:16px 32px;font-size:12px;color:#9898B0;text-align:center;">
      You're receiving this because you have a Lunchbox by Chumpys Kitchen account.
    </div>
  </div>
</body>
</html>`,
        }),
      });

      if (res.ok) sent++;
    }

    // Log notification
    await supabase.from("notifications").insert({
      type: "menu_change",
      message: `Menu updated for ${displayDate} — ${items.length} item(s). ${sent} parent(s) notified.`,
      date_ref: date,
    });

    return new Response(JSON.stringify({ sent, total: parentUsers.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error(err);
    return new Response(