import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Presage SmartSpectra SDK v3.5.0 Server-Sent Events (SSE) Telemetry Endpoint.
 *
 * Verifies `process.env.SMARTSPECTRA_API_KEY` from `.env.local`, queries the native
 * `@smartspectra/node-sdk` runtime when available, and gracefully falls back in serverless
 * environments (e.g. Vercel Lambda without GLIBC 2.35) so client-side optical rPPG continues seamlessly.
 */
export async function GET(req: NextRequest) {
  const apiKey = process.env.SMARTSPECTRA_API_KEY;
  const hasApiKey = Boolean(apiKey && apiKey.trim().length > 0);

  let sdkVersion = "3.5.0";
  let cameras: { id: string; name: string }[] = [];
  let metrics = { breathing: 3, cardio: 3, face: 2 };
  let isNativeLoaded = false;

  try {
    const sdk = await import("@smartspectra/node-sdk");
    if (sdk && sdk.SmartSpectraSDK) {
      sdkVersion = sdk.SmartSpectraSDK.version || "3.5.0";
      try {
        cameras = (sdk.SmartSpectraSDK.availableCameras?.() || []) as {
          id: string;
          name: string;
        }[];
      } catch {
        cameras = [];
      }
      metrics = {
        breathing: sdk.breathingMetrics?.length ?? 3,
        cardio: sdk.cardioMetrics?.length ?? 3,
        face: sdk.faceMetrics?.length ?? 2,
      };
      isNativeLoaded = true;
    }
  } catch {
    // Native shared library (.so) not supported on target OS (e.g. Amazon Linux on Vercel)
    isNativeLoaded = false;
  }

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

      sendEvent({
        type: "status",
        apiKeyConfigured: hasApiKey,
        sdkVersion,
        cameras,
        activeMetrics: metrics,
        runtimeMode: isNativeLoaded ? "native-c-sdk" : "client-optical-rppg",
      });

      // Keep SSE connection alive while client is connected
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
