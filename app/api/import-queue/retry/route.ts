import { NextResponse } from "next/server";
import { retryDueImports } from "../../../../lib/import-queue";

export async function POST() {
  const result = await retryDueImports(5);
  return NextResponse.json(result);
}

