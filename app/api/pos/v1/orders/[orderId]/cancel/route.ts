import { NextRequest, NextResponse } from "next/server";
import { isPosRequest } from "@/app/lib/adminAuth";
import { cancelOpenPosOrder } from "@/app/lib/dynamodb-server";

type Context = { params: Promise<{ orderId: string }> };

export async function POST(request: NextRequest, { params }: Context) {
  if (!isPosRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { await cancelOpenPosOrder((await params).orderId); }
  catch { return NextResponse.json({ error: "Only open POS orders can be cancelled" }, { status: 409 }); }
  return NextResponse.json({ cancelled: true });
}
