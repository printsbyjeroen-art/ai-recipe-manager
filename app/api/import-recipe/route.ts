import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";
import { processQueueItem } from "../../../lib/import-queue";

function isMissingImportQueueUserIdColumnError(err: any): boolean {
  const message = String(err?.message ?? "").toLowerCase();
  return message.includes("import_queue.user_id") && message.includes("does not exist");
}

function normalizeUrl(input: string): string {
  const parsed = new URL(input.trim());

  // Remove fragment and common marketing params for stable duplicate detection.
  parsed.hash = "";
  const dropParams = ["gclid", "fbclid", "mc_cid", "mc_eid"];
  for (const key of [...parsed.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || dropParams.includes(key.toLowerCase())) {
      parsed.searchParams.delete(key);
    }
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, "") || "/";
  parsed.pathname = normalizedPath;

  const sortedParams = [...parsed.searchParams.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  );
  parsed.search = "";
  for (const [key, value] of sortedParams) {
    parsed.searchParams.append(key, value);
  }

  return parsed.toString();
}

export async function POST(request: Request) {
  const { url, userId } = (await request.json()) as { url?: string; userId?: string };

  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }

  try {
    let normalizedUrl: string;
    try {
      normalizedUrl = normalizeUrl(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    // Prevent duplicate submissions that are already in the waiting list.
    let openQueueQuery = supabaseAdmin
      .from("import_queue")
      .select("id, url, status")
      .eq("user_id", userId)
      .in("status", ["pending", "processing", "failed"])
      .order("created_at", { ascending: false });

    let { data: openQueueItems, error: openQueueError } = await openQueueQuery;

    if (openQueueError && isMissingImportQueueUserIdColumnError(openQueueError)) {
      const fallback = await supabaseAdmin
        .from("import_queue")
        .select("id, url, status")
        .in("status", ["pending", "processing", "failed"])
        .order("created_at", { ascending: false });
      openQueueItems = fallback.data;
      openQueueError = fallback.error;
    }

    if (openQueueError) {
      return NextResponse.json(
        { error: openQueueError.message || "Failed to check waiting list" },
        { status: 500 }
      );
    }

    const duplicateQueueItem = (openQueueItems ?? []).find((item) => {
      try {
        return normalizeUrl(item.url) === normalizedUrl;
      } catch {
        return item.url.trim() === url.trim();
      }
    });

    if (duplicateQueueItem) {
      return NextResponse.json({
        status: "duplicate_in_queue",
        queueId: duplicateQueueItem.id,
        queueStatus: duplicateQueueItem.status,
        message: "This link is already in the waiting list."
      });
    }

    // Prevent duplicate submissions that already exist as saved recipes.
    const { data: recipesWithSource, error: recipesError } = await supabaseAdmin
      .from("recipes")
      .select("id, source_url")
      .eq("user_id", userId)
      .not("source_url", "is", null)
      .neq("source_url", "")
      .order("created_at", { ascending: false });

    if (recipesError) {
      return NextResponse.json(
        { error: recipesError.message || "Failed to check existing recipes" },
        { status: 500 }
      );
    }

    const duplicateRecipe = (recipesWithSource ?? []).find((recipe) => {
      try {
        return normalizeUrl(recipe.source_url) === normalizedUrl;
      } catch {
        return recipe.source_url.trim() === url.trim();
      }
    });

    if (duplicateRecipe) {
      return NextResponse.json({
        status: "duplicate_in_dashboard",
        recipeId: duplicateRecipe.id,
        message: "This link already exists in your dashboard recipes."
      });
    }

    const now = new Date().toISOString();

    // ── Rate limit: max 20 imports per 24 hours ──────────────────────────────
    const DAILY_LIMIT = 20;
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await supabaseAdmin
      .from("import_queue")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since24h);

    if ((recentCount ?? 0) >= DAILY_LIMIT) {
      // Queue the request but delay processing by 24 hours.
      const processAfter = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { data: waitItem, error: waitError } = await supabaseAdmin
        .from("import_queue")
        .insert({
          user_id: userId,
          url: normalizedUrl,
          status: "pending",
          process_after: processAfter,
          created_at: now,
          updated_at: now
        })
        .select("*")
        .single();

      if (waitError || !waitItem) {
        return NextResponse.json(
          { error: waitError?.message || "Failed to queue import" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        status: "rate_limit_queued",
        queueId: waitItem.id,
        processAfter,
        message: `You've reached the ${DAILY_LIMIT} imports/day limit. This recipe has been added to the 24-hour waitlist and will be processed automatically.`
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    let { data: queueItem, error: queueError } = await supabaseAdmin
      .from("import_queue")
      .insert({
        user_id: userId,
        url: normalizedUrl,
        status: "pending",
        created_at: now,
        updated_at: now
      })
      .select("*")
      .single();

    if (queueError && isMissingImportQueueUserIdColumnError(queueError)) {
      const fallback = await supabaseAdmin
        .from("import_queue")
        .insert({
          url: normalizedUrl,
          status: "pending",
          created_at: now,
          updated_at: now
        })
        .select("*")
        .single();
      queueItem = fallback.data;
      queueError = fallback.error;
    }

    if (queueError || !queueItem) {
      return NextResponse.json(
        { error: queueError?.message || "Failed to enqueue import" },
        { status: 500 }
      );
    }

    const result = await processQueueItem(queueItem as any, userId);

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

