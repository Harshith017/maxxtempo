// Ops Desk server function (Supabase Edge Function, deployed with verify_jwt off; it checks callers itself).
//
//   {action:"key"}                                   the public key phones need to subscribe to alerts
//   {action:"add_member", email, name, role, password}   admin only: create a teammate's account
//   {action:"reset_password", user_id, password}         admin only: set a temporary password
//   {action:"bootstrap", setup_key, email, name, password}  once, while there are no members: the first admin
//   {action:"tick"}  (x-cron-key header)             the scheduler: push new notifications to phones

import { createClient } from "npm:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush@0.5.0";

const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "https://harshith017.github.io";
const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (status: number, error: string) => reply(status, { ok: false, error });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CONTACT = "https://harshith017.github.io/maxxtempo/ops-desk/";

function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

type Config = { cron_key: string; setup_key: string; vapid: webpush.ExportedVapidKeys | null };
async function config(): Promise<Config> {
  const { data, error } = await admin.from("ops_config").select("cron_key,setup_key,vapid").eq("id", 1).single();
  if (error) throw new Error("config: " + error.message);
  return data as Config;
}

// The VAPID key pair: made once, stored, then only read.
let server: webpush.ApplicationServer | null = null, publicKey = "";
async function appServer(cfg?: Config) {
  if (server) return server;
  cfg ??= await config();
  let exported = cfg.vapid;
  if (!exported) {
    exported = await webpush.exportVapidKeys(await webpush.generateVapidKeys({ extractable: true }));
    await admin.from("ops_config").update({ vapid: exported }).eq("id", 1).is("vapid", null);
    exported = (await config()).vapid!;
  }
  const keys = await webpush.importVapidKeys(exported, { extractable: false });
  publicKey = await webpush.exportApplicationServerKey(keys);
  server = await webpush.ApplicationServer.new({ contactInformation: CONTACT, vapidKeys: keys });
  return server;
}

type Sub = { endpoint: string; user_id: string; p256dh: string; auth: string };
async function send(sub: Sub, msg: { title: string; body: string; caseId: number | null }) {
  const as = await appServer();
  try {
    await as.subscribe({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } })
      .pushTextMessage(JSON.stringify(msg), { ttl: 3600, urgency: webpush.Urgency.High });
    return true;
  } catch (e) {
    const status = e instanceof webpush.PushMessageError ? e.response.status : 0;
    if (status === 404 || status === 410) await admin.from("push_subs").delete().eq("endpoint", sub.endpoint);
    else console.error("push failed", status, String(e));
    return false;
  }
}

async function caller(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return null;
  const { data } = await admin.from("members").select("*").eq("user_id", user.id).eq("active", true).maybeSingle();
  return data as { user_id: string; role: string } | null;
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
async function createAccount(email: string, name: string, role: string, password: string) {
  if (!/^\S+@\S+\.\S+$/.test(email)) return "That email looks wrong";
  if (!name) return "Add a name";
  if (password.length < 8) return "The password needs at least 8 characters";
  if (!["admin", "agent"].includes(role)) return "Pick a role";
  const { error: e1 } = await admin.rpc("prepare_account", { p_email: email, p_name: name, p_role: role });
  if (e1) return e1.message;
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) return /already/i.test(error.message) ? "That email already has an account" : error.message;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail(405, "POST only");
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  try {
    switch (body.action) {
      case "key":
        await appServer();
        return reply(200, { ok: true, key: publicKey });

      case "tick": {
        const cfg = await config();
        if (!same(req.headers.get("x-cron-key") ?? "", cfg.cron_key)) return fail(401, "key");
        await appServer(cfg);
        const { data: items, error } = await admin.rpc("claim_pushes");
        if (error) throw error;
        const users = [...new Set((items ?? []).map((n: { user_id: string }) => n.user_id))];
        const { data: subs } = users.length ? await admin.from("push_subs").select("*").in("user_id", users) : { data: [] };
        let sent = 0;
        for (const n of items ?? []) {
          for (const s of (subs ?? []).filter((s: Sub) => s.user_id === n.user_id)) {
            if (await send(s, { title: n.kind === "reminder" ? "Ops Desk reminder" : "Ops Desk", body: n.message, caseId: n.case_id })) sent++;
          }
        }
        return reply(200, { ok: true, notifications: items?.length ?? 0, sent });
      }

      case "bootstrap": {
        const cfg = await config();
        if (!same(String(body.setup_key ?? ""), cfg.setup_key)) return fail(401, "key");
        const { count } = await admin.from("members").select("*", { count: "exact", head: true });
        if (count) return fail(409, "Ops Desk already has an admin");
        const err = await createAccount(clean(body.email, 200).toLowerCase(), clean(body.name, 100), "admin", String(body.password ?? ""));
        return err ? fail(400, err) : reply(200, { ok: true });
      }

      case "add_member": {
        const me = await caller(req);
        if (me?.role !== "admin") return fail(403, "Admins only");
        const err = await createAccount(clean(body.email, 200).toLowerCase(), clean(body.name, 100), String(body.role ?? "agent"), String(body.password ?? ""));
        return err ? fail(400, err) : reply(200, { ok: true });
      }

      case "reset_password": {
        const me = await caller(req);
        if (me?.role !== "admin") return fail(403, "Admins only");
        const password = String(body.password ?? "");
        if (password.length < 8) return fail(400, "The password needs at least 8 characters");
        const id = String(body.user_id ?? "");
        const { data: m } = await admin.from("members").select("user_id").eq("user_id", id).maybeSingle();
        if (!m) return fail(404, "Teammate not found");
        const { error } = await admin.auth.admin.updateUserById(id, { password });
        if (error) return fail(400, error.message);
        await admin.from("members").update({ must_change_password: true }).eq("user_id", id);
        return reply(200, { ok: true });
      }
    }
    return fail(400, "Unknown action");
  } catch (e) {
    console.error(e);
    return fail(500, "Something went wrong on the server");
  }
});
