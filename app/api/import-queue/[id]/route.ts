import { NextResponse } from "next/server";
import { deleteImportQueueItem } from "../../../../lib/db";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await deleteImportQueueItem(params.id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
