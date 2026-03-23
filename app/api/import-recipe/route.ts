import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";
import { processQueueItem } from "../../../lib/import-queue";

export async function POST(request: Request) {
  const { url } = (await request.json()) as { url?: string };

  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  try {
    const now = new Date().toISOString();

    const { data: queueItem, error: queueError } = await supabaseAdmin
      .from("import_queue")
      .insert({
        url,
        status: "pending",
        created_at: now,
        updated_at: now
      })
      .select("*")
      .single();

    if (queueError || !queueItem) {
      return NextResponse.json(
        { error: queueError?.message || "Failed to enqueue import" },
        { status: 500 }
      );
    }

    const result = await processQueueItem(queueItem as any);

    if (result.ok && result.recipeId) {
      const resp: any = {
        status: "imported",
        recipeId: result.recipeId,
        queueId: queueItem.id
      };
      if (result.rawResponse) resp.rawResponse = result.rawResponse;
      return NextResponse.json(resp);
    }

    const resp: any = {
      status: "queued",
      queueId: queueItem.id
    };
    if (result.rawResponse) resp.rawResponse = result.rawResponse;
    if (result.error) resp.error = result.error;
    return NextResponse.json(resp);
  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      { error: error.message || "Unexpected error" },
      { status: 500 }
    );
  }
}

