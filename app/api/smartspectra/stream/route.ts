import { NextRequest } from "next/server";
import {
  SmartSpectraSDK,
  breathingMetrics,
  cardioMetrics,
  faceMetrics,
} from "@smartspectra/node-sdk";

/**
 * Presage SmartSpectra SDK v3.5.0 Server-Sent Events (SSE) Telemetry Endpoint.
 *
 * Verifies `process.env.SMARTSPECTRA_API_KEY` from `.env.local`, queries the native
 * `@smartspectra/node-sdk` runtime (version + available camera hardware + requested
 * breathing/cardio/face metric descriptors), and maintains the live SSE bridge
 * for the Mochi client.
 */
export async function GET(req: NextRequest) {
  const apiKey = process.env.SMARTSPECTRA_API_KEY;
  const hasApiKey = Boolean(apiKey && apiKey.trim().length > 0);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const sendEvent = (data: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };

      let cameras: ReturnType<typeof SmartSpectraSDK.availableCameras> = [];
      try {
        cameras = SmartSpectraSDK.availableCameras();
      } catch {
        cameras = [];
      }

      sendEvent({
        type: "status",
        apiKeyConfigured: hasApiKey,
        sdkVersion: SmartSpectraSDK.version,
        cameras,
        activeMetrics: {
          breathing: breathingMetrics.length,
          cardio: cardioMetrics.length,
          face: faceMetrics.length,
        },
      });

      // Keep SSE connection alive while camera is active
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
