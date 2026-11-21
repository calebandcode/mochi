import { NextRequest } from "next/server";
import {
  ensureSmartSpectraStarted,
  subscribeSmartSpectra,
  type PresageServerEvent,
} from "@/lib/smartspectra-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const hasApiKey = Boolean(process.env.SMARTSPECTRA_API_KEY?.trim());
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

      sendEvent({
        type: "status",
        apiKeyConfigured: hasApiKey,
        sdkVersion: state.sdkVersion,
        cameras: state.cameras,
        activeMetrics: state.activeMetrics,
        runtimeMode: state.runtimeMode,
        error: state.lastError ?? undefined,
      });

      const unsubscribe = subscribeSmartSpectra((event) => {
        sendEvent(event);
      });

      const heartbeatTimer = setInterval(() => {
        if (closed) return;
        sendEvent({ type: "keepalive", timestamp: Date.now() });
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
