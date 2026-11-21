import { NextRequest, NextResponse } from "next/server";
import { pushSmartSpectraFrame } from "@/lib/smartspectra-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Receives live raw RGBA webcam frames from the browser and pushes them directly
 * into the native Presage SmartSpectra SDK via `sdk.sendFrame(...)`.
 *
 * All frame bytes live strictly in volatile memory for the duration of the call
 * and are never written to disk or persisted.
 */
export async function POST(req: NextRequest) {
  const width = Number(req.headers.get("x-frame-width") || "0");
  const height = Number(req.headers.get("x-frame-height") || "0");
  const timestampUs = Number(req.headers.get("x-frame-ts") || "0");

  if (!width || !height || width > 1280 || height > 720) {
    return NextResponse.json({ accepted: false }, { status: 400 });
  }

  const arrayBuf = await req.arrayBuffer();
  const expectedBytes = width * height * 4;
  if (arrayBuf.byteLength !== expectedBytes) {
    return NextResponse.json({ accepted: false }, { status: 400 });
  }

  const accepted = pushSmartSpectraFrame(
    Buffer.from(arrayBuf),
    width,
    height,
    timestampUs
  );

  return new Response(null, {
    status: accepted ? 204 : 202,
  });
}
