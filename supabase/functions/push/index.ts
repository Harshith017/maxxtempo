// MaxxTempo — notifications (web push).
//
//   POST {action:"key"}
//     The public key phones need to subscribe. The key pair is made here the first
//     time and kept in push_config; the private half never leaves the server.
//
//   POST {action:"test"}           (signed in)
//     Sends "Notifications are on" to the caller's own phones.
//
//   POST {action:"tick"}           (x-cron-key header; only the database calls this)
//     Called by pg_cron (private.push_tick) when a rest timer ends, and with
//     daily:true at :00 and :30 UTC (every whole local hour, India's :30 offset too).
//     - Rest timers: push_jobs rows ending now → "Rest over" on the second; the row goes.
//     - Daily reminders, in each phone's own time zone, only for what that person
//       turned on in Settings → Notifications:
//         water     09, 12, 15, 18, 21
//         protein   16, 19   (only while under target)
//         fibre     16, 19   (only while under target)
//         steps     15, 20   (only while under the step goal)
//         calories  14, 20   (eaten so far vs target)
//       push_sent stops the same reminder going twice. Phones that have
//       unsubscribed (404/410 from the push service) are removed.
//
// Numbers come from push_state, which the app updates while it's open; steps also
// come from Apple Health sync (docs/health), which can arrive while the app is closed.

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
const fail = (status: number, code: string) => reply(status, { ok: false, code });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CONTACT = "https://harshith017.github.io/maxxtempo/";

function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

type Config = { cron_key: string; vapid: webpush.ExportedVapidKeys | null };
async function config(): Promise<Config> {
  const { data, error } = await admin.from("push_config").select("cron_key,vapid").eq("id", 1).single();
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
    // Only fill it if it's still empty, so two first calls can't end up with different keys.
    await admin.from("push_config").update({ vapid: exported }).eq("id", 1).is("vapid", null);
    exported = (await config()).vapid!;
  }
  const keys = await webpush.importVapidKeys(exported, { extractable: false });
  publicKey = await webpush.exportApplicationServerKey(keys);
  server = await webpush.ApplicationServer.new({ contactInformation: CONTACT, vapidKeys: keys });
  return server;
}

type Sub = { endpoint: string; user_id: string; p256dh: string; auth: string; tz: string; prefs: Record<string, boolean> };
type Msg = { title: string; body: string; tag: string; view?: string };

// Sends to one phone. A phone that has gone (404/410) is removed; other failures are counted.
async function send(sub: Sub, msg: Msg, ttl = 3600, urgency = webpush.Urgency.Normal) {
  const as = await appServer();
  try {
    await as.subscribe({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } })
      .pushTextMessage(JSON.stringify(msg), { ttl, urgency, topic: msg.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined });
    return true;
  } catch (e) {
    const status = e instanceof webpush.PushMessageError ? e.response.status : 0;
    if (status === 404 || status === 410) await admin.from("push_subs").delete().eq("endpoint", sub.endpoint);
    else console.error("push failed", status, String(e));
    return false;
  }
}

// Local date, hour and minute in a time zone.
function localNow(tz: string, now: Date) {
  let parts: Intl.DateTimeFormatPart[];
  try { parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now); }
  catch { return localNow("Asia/Kolkata", now); }
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, hour: Number(g("hour")), minute: Number(g("minute")) };
}

const AT: Record<string, number[]> = { water: [9, 12, 15, 18, 21], protein: [16, 19], fiber: [16, 19], steps: [15, 20], kcal: [14, 20] };
const n0 = (v: number) => Math.round(v).toLocaleString("en-IN");

type State = { date: string; kcal: number; kcal_t: number; protein: number; protein_t: number; fiber: number; fiber_t: number; steps: number; steps_t: number; water: number; water_t: number };

// The message for one reminder, or null when there's nothing to say (target already met).
export function message(kind: string, s: State | null, date: string, healthSteps: number): Msg | null {
  const today = s && s.date === date;
  const v = (k: keyof State) => (today ? Number(s![k]) || 0 : 0);
  const t = (k: keyof State) => Number(s?.[k]) || 0;   // targets carry over from yesterday
  switch (kind) {
    case "water": {
      const ml = v("water"), goal = t("water_t");
      return { title: "Time for some water 💧", body: goal ? `${(ml / 1000).toFixed(1)} of ${(goal / 1000).toFixed(1)} L so far today.` : "Have a glass of water and log it.", tag: "water", view: "food" };
    }
    case "protein": case "fiber": {
      const name = kind === "protein" ? "Protein" : "Fibre", got = v(kind), goal = t(`${kind}_t` as keyof State);
      if (!goal) return { title: `${name} check`, body: `Log what you've eaten to see your ${name.toLowerCase()} for today.`, tag: kind, view: "food" };
      if (got >= goal) return null;
      return { title: `${name}: ${n0(goal - got)} g to go`, body: `${n0(got)} of ${n0(goal)} g so far today.`, tag: kind, view: "food" };
    }
    case "steps": {
      const got = Math.max(v("steps"), healthSteps), goal = t("steps_t") || 10000;
      if (got >= goal) return null;
      return { title: `Steps: ${n0(goal - got)} to go`, body: got ? `${n0(got)} of ${n0(goal)} steps so far today.` : `Goal today: ${n0(goal)} steps.`, tag: "steps", view: "food" };
    }
    case "kcal": {
      const got = v("kcal"), goal = t("kcal_t");
      if (!goal) return { title: "Calories eaten", body: "Nothing logged yet today.", tag: "kcal", view: "food" };
      const left = goal - got;
      return { title: `Eaten: ${n0(got)} of ${n0(goal)} kcal`, body: left >= 0 ? `${n0(left)} kcal left for today.` : `${n0(-left)} kcal over today's target.`, tag: "kcal", view: "food" };
    }
  }
  return null;
}

// Timers ending within the next 15 s (the schedule runs every 15 s): each is claimed
// (deleted) first so a later run can't send it again, then sent on the second.
async function restJobs() {
  const { data: jobs } = await admin.from("push_jobs").select("user_id,send_at").lte("send_at", new Date(Date.now() + 15_000).toISOString()).order("send_at");
  let sent = 0;
  const mine = [];
  for (const j of jobs ?? []) {
    // Remove only this timer, so one restarted meanwhile isn't lost.
    const { data: gone } = await admin.from("push_jobs").delete().eq("user_id", j.user_id).eq("send_at", j.send_at).select("user_id");
    if (gone?.length && Date.now() - Date.parse(j.send_at) < 5 * 60_000) mine.push(j);   // older ones are too late to be useful
  }
  for (const j of mine) {
    const wait = Date.parse(j.send_at) - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    // Time added in the meantime (+15/+30/+60) makes a later row; that one will be sent instead.
    const { data: later } = await admin.from("push_jobs").select("user_id").eq("user_id", j.user_id).maybeSingle();
    if (later) continue;
    const { data: subs } = await admin.from("push_subs").select("*").eq("user_id", j.user_id);
    for (const s of (subs ?? []) as Sub[]) if (s.prefs?.rest && await send(s, { title: "Rest over", body: "Time for your next set 💪", tag: "rest", view: "gym" }, 120, webpush.Urgency.High)) sent++;
  }
  return sent;
}

async function reminders(now: Date) {
  const { data: subs } = await admin.from("push_subs").select("*");
  const byUser = new Map<string, Sub[]>();
  for (const s of (subs ?? []) as Sub[]) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  let sent = 0;
  for (const [user, list] of byUser) {
    // What's due for this person now (each phone's own clock, first 10 minutes of the hour).
    const due = new Map<string, { slot: string; date: string; subs: Sub[] }>();
    for (const s of list) {
      const L = localNow(s.tz || "Asia/Kolkata", now);
      if (L.minute >= 10) continue;
      for (const [kind, hours] of Object.entries(AT)) {
        if (!s.prefs?.[kind] || !hours.includes(L.hour)) continue;
        const slot = `${L.date}:${kind}:${L.hour}`;
        const d = due.get(slot) ?? { slot, date: L.date, subs: [] }; d.subs.push(s); due.set(slot, d);
      }
    }
    if (!due.size) continue;
    const { data: claimed } = await admin.from("push_sent").upsert([...due.keys()].map((slot) => ({ user_id: user, slot })), { onConflict: "user_id,slot", ignoreDuplicates: true }).select("slot");
    if (!claimed?.length) continue;
    const { data: st } = await admin.from("push_state").select("*").eq("user_id", user).maybeSingle();
    const healthSteps: Record<string, number> = {};
    for (const { slot, date } of due.values()) {
      if (!slot.includes(":steps:") || date in healthSteps) continue;
      const { data: h } = await admin.from("docs").select("data").eq("user_id", user).eq("collection", "health").eq("id", date).maybeSingle();
      healthSteps[date] = Number((h?.data as { steps?: number } | null)?.steps) || 0;
    }
    for (const { slot } of claimed) {
      const d = due.get(slot); if (!d) continue;
      const msg = message(slot.split(":")[1], st as State | null, d.date, healthSteps[d.date] ?? 0);
      if (!msg) continue;
      for (const s of d.subs) if (await send(s, msg)) sent++;
    }
  }
  // Keep push_sent small.
  if (now.getUTCHours() === 0 && now.getUTCMinutes() < 10) await admin.from("push_sent").delete().lt("sent_at", new Date(now.getTime() - 3 * 86400_000).toISOString());
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail(405, "method");
  let body: { action?: string; daily?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body */ }
  try {
    switch (body.action) {
      case "key": {
        await appServer();
        return reply(200, { ok: true, key: publicKey });
      }
      case "test": {
        const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        const { data: { user } } = await admin.auth.getUser(token);
        if (!user) return fail(401, "signed_out");
        const { data: subs } = await admin.from("push_subs").select("*").eq("user_id", user.id);
        if (!subs?.length) return fail(404, "no_subscription");
        let sent = 0;
        for (const s of subs as Sub[]) if (await send(s, { title: "Notifications are on", body: "You'll get the reminders you picked in Settings.", tag: "test" }, 300, webpush.Urgency.High)) sent++;
        return reply(200, { ok: sent > 0, sent, code: sent ? undefined : "send_failed" });
      }
      case "tick": {
        const cfg = await config();
        if (!same(req.headers.get("x-cron-key") ?? "", cfg.cron_key)) return fail(401, "key");
        await appServer(cfg);
        const now = new Date();
        const rest = await restJobs();
        const daily = body.daily ? await reminders(now) : 0;
        return reply(200, { ok: true, rest, daily });
      }
    }
    return fail(400, "action");
  } catch (e) {
    console.error(e);
    return fail(500, "server");
  }
});
