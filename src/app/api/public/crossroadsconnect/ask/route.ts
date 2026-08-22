import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";

function publicClient() {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession:false, autoRefreshToken:false } });
}

function eventText(e: Record<string, unknown>) {
  const when = new Date(String(e.start_at)).toLocaleString("en-US", { dateStyle:"full", timeStyle:"short", timeZone:"America/New_York" });
  return `${e.title} is on ${when}${e.location ? ` at ${e.location}` : ""}.${e.description ? ` ${e.description}` : ""}${e.cost ? ` Cost: ${e.cost}.` : ""}${e.rsvp_url ? ` RSVP: ${e.rsvp_url}` : ""}${e.contact ? ` Contact: ${e.contact}.` : ""}`;
}

export async function POST(request: Request) {
  const supabase = publicClient();
  if (!supabase) return NextResponse.json({ error:"Guardian is not configured" }, { status:503 });
  const { question } = await request.json();
  const q = String(question || "").trim().toLowerCase();
  if (!q) return NextResponse.json({ error:"Ask a question" }, { status:400 });

  const { data, error } = await supabase.from("knowledge_events").select("title,description,start_at,end_at,location,organizer,contact,rsvp_url,cost,audience,source_label").eq("organization_slug","crossroadsconnect").eq("lifecycle_status","published").eq("visibility","public").order("start_at", { ascending:true });
  if (error) return NextResponse.json({ error:error.message }, { status:500 });
  const events = data ?? [];
  if (!events.length) return NextResponse.json({ answer:"I don't have any published Crossroads Connect event information yet.", sources:[] });

  const now = Date.now();
  const upcoming = events.filter(e => new Date(e.start_at).getTime() >= now);
  let matches = events;
  if (/next|upcoming|coming|future/.test(q)) matches = upcoming.length ? [upcoming[0]] : [];
  else {
    const named = events.filter(e => q.includes(String(e.title).toLowerCase()));
    if (named.length) matches = named;
    else if (/today/.test(q)) matches = events.filter(e => new Date(e.start_at).toDateString() === new Date().toDateString());
    else if (/where|location|address|rsvp|register|cost|price|fee|when|time|date|event/.test(q)) matches = upcoming.length ? [upcoming[0]] : [events[events.length-1]];
  }
  if (!matches.length) return NextResponse.json({ answer:"I don't see a published upcoming Crossroads Connect event that answers that yet.", sources:[] });
  return NextResponse.json({ answer: matches.slice(0,3).map(eventText).join("\n\n"), sources: matches.slice(0,3).map(e => e.source_label || "Published Crossroads Connect event") });
}
