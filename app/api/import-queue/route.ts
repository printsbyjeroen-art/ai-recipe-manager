import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";

function isMissingImportQueueUserIdColumnError(err: any): boolean {
  const message = String(err?.message ?? "").toLowerCase();
  return message.includes("import_queue.user_id") && message.includes("does not exist");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }

  let { data, error } = await supabaseAdmin
    .from("import_queue")
    .select("*")
    .eq("user_id", userId)
    // include completed too so the front-end can show them separately
    .order("created_at", { ascending: true })
    .limit(50);

  if (error && isMissingImportQueueUserIdColumnError(error)) {
    const fallback = await supabaseAdmin
      .from("import_queue")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(50);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

