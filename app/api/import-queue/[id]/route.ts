import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const { error, count } = await supabaseAdmin
    .from("import_queue")
    .delete()
    .eq("id", id);
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: count });
}

