import { NextResponse } from "next/server";
import { retryDueImports } from "../../../../lib/import-queue";

export async function POST() {
  const startedAt = Date.now();
  console.info("[import-retry] run started");

  try {
    const result = await retryDueImports(5);
    console.info("[import-retry] run completed", {
      ...result,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[import-retry] run failed", {
      durationMs: Date.now() - startedAt,
      message: error?.message,
      stack: error?.stack
    });
    return NextResponse.json(
      { error: error?.message || "Retry run failed" },
      { status: 500 }
    );
  }
}

