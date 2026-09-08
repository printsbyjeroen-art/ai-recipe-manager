import { NextResponse } from "next/server";
import {
  countRecentImports,
  createImportQueueItem,
  listOpenImportQueue,
  listRecipesWithSourceUrl
} from "../../../lib/db";
import { processQueueItem } from "../../../lib/import-queue";

function normalizeUrl(input: string): string {
  const parsed = new URL(input.trim());

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

  try {
    let normalizedUrl: string;
    try {
      normalizedUrl = normalizeUrl(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    const openQueueItems = await listOpenImportQueue(userId);

    const duplicateQueueItem = openQueueItems.find((item) => {
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

    const recipesWithSource = await listRecipesWithSourceUrl(userId);

    const duplicateRecipe = recipesWithSource.find((recipe) => {
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

    const DAILY_LIMIT = 20;
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentCount = await countRecentImports(userId, since24h);

    if (recentCount >= DAILY_LIMIT) {
      const processAfter = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const waitItem = await createImportQueueItem({
        userId,
        url: normalizedUrl,
        process_after: processAfter
      });

      return NextResponse.json({
        status: "rate_limit_queued",
        queueId: waitItem.id,
        processAfter,
        message: `You've reached the ${DAILY_LIMIT} imports/day limit. This recipe has been added to the 24-hour waitlist and will be processed automatically.`
      });
    }

    const queueItem = await createImportQueueItem({
      userId,
      url: normalizedUrl
    });

    const result = await processQueueItem(queueItem, userId);

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
