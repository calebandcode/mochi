import { NextRequest } from "next/server";
import {
  ensureSmartSpectraStarted,
  subscribeSmartSpectra,
  type PresageServerEvent,
} from "@/lib/smartspectra-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Presage SmartSpectra SDK v3.5.0 Server-Sent Events (SSE) Live Metrics Stream.
 *
 * Starts the native `@smartspectra/node-sdk` pipeline in custom-input mode using
 * `process.env.SMARTSPECTRA_API_KEY`, and streams live decoded Presage protobuf
 * metrics (`cardio.pulseRate`, `cardio.arterialPressureTrace`, `breathing.rate`,
 * `breathing.upperTrace`, `face.expression`, `face.landmarks`, `validationStatus`)
 * directly to the Mochi client.
 */
export async function GET(req: NextRequest) {
  const apiKey = process.env.SMARTSPECTRA_API_KEY?.trim() || "";
  const hasApiKey = apiKey.length > 0;

  const state = await ensureSmartSpectraStarted();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const sendEvent = (data: PresageServerEvent | Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };

      // Send immediate runtime status handshake
      sendEvent({
        type: "status",
        apiKeyConfigured: hasApiKey,
        sdkVersion: state.sdkVersion,
        cameras: state.cameras,
        activeMetrics: state.activeMetrics,
        runtimeMode: state.runtimeMode,
        error: state.lastError ?? undefined,
      });

      // Subscribe to real-time decoded Presage SDK metrics & validation events
      const unsubscribe = subscribeSmartSpectra((event) => {
        sendEvent(event);
      });

      const heartbeatTimer = setInterval(() => {
        if (closed) return;
        sendEvent({
          type: "keepalive",
          timestamp: Date.now(),
        });
      }, 15000);

      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(heartbeatTimer);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
