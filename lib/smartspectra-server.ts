/**
 * Server-side singleton manager for the native Presage `@smartspectra/node-sdk` (v3.5.0).
 *
 * Native SDK state is process-global, so storing the manager on `globalThis` guarantees
 * that `/api/smartspectra/stream` (SSE) and `/api/smartspectra/frame` (RGBA frame push)
 * share the exact same live SmartSpectraSDK instance.
 */

export type PresageServerEvent =
  | {
      type: "status";
      apiKeyConfigured: boolean;
      sdkVersion: string;
      cameras: { id: string; name: string | null }[];
      activeMetrics: { breathing: number; cardio: number; face: number };
      runtimeMode: "native-presage-sdk" | "serverless-fallback";
      error?: string;
    }
  | {
      type: "validation";
      code: number;
      hint: string;
      facePresent: boolean;
      timestampUs: number;
    }
  | {
      type: "processingStatus";
      status: number;
    }
  | {
      type: "metrics";
      timestampUs: number;
      pulseBpm: number | null;
      pulseConfidence: number | null;
      pulseStable: boolean;
      pulseTrace: number[];
      hrvRmssd: number | null;
      breathingRateBpm: number | null;
      breathingConfidence: number | null;
      breathingTrace: number[];
      expression: "calm" | "grin" | "surprised" | null;
      expressionLabel: string | null;
      landmarkCenter: { x: number; y: number } | null;
    }
  | {
      type: "sdk_error";
      code: number;
      message: string;
      retryable: boolean;
    };

type Listener = (event: PresageServerEvent) => void;

// ExpressionType enum from @smartspectra/node-sdk/messages
const EXPRESSION_NAMES: Record<number, string> = {
  0: "UNSPECIFIED",
  1: "ANGRY",
  2: "CONTEMPT",
  3: "DISGUST",
  4: "FEAR",
  5: "HAPPY",
  6: "NEUTRAL",
  7: "SAD",
  8: "SURPRISE",
};

interface SmartSpectraGlobalState {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sdk: any | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pixelFormatRGBA: number;
  running: boolean;
  runtimeMode: "native-presage-sdk" | "serverless-fallback";
  sdkVersion: string;
  cameras: { id: string; name: string | null }[];
  activeMetrics: { breathing: number; cardio: number; face: number };
  lastError: string | null;
  lastTimestampUs: number;
  listeners: Set<Listener>;
  stopTimer: ReturnType<typeof setTimeout> | null;
  initPromise: Promise<void> | null;
}

const globalRef = globalThis as typeof globalThis & {
  __mochiSmartSpectra?: SmartSpectraGlobalState;
};

function getState(): SmartSpectraGlobalState {
  if (!globalRef.__mochiSmartSpectra) {
    globalRef.__mochiSmartSpectra = {
      sdk: null,
      pixelFormatRGBA: 2, // PixelFormat.kRGBA
      running: false,
      runtimeMode: "serverless-fallback",
      sdkVersion: "3.5.0",
      cameras: [],
      activeMetrics: { breathing: 3, cardio: 3, face: 4 },
      lastError: null,
      lastTimestampUs: 0,
      listeners: new Set(),
      stopTimer: null,
      initPromise: null,
    };
  }
  return globalRef.__mochiSmartSpectra;
}

function broadcast(event: PresageServerEvent) {
  const state = getState();
  for (const listener of state.listeners) {
    try {
      listener(event);
    } catch {
      // Ignore closed subscriber
    }
  }
}

export async function ensureSmartSpectraStarted(): Promise<SmartSpectraGlobalState> {
  const state = getState();
  if (state.stopTimer) {
    clearTimeout(state.stopTimer);
    state.stopTimer = null;
  }

  if (state.running && state.sdk) {
    return state;
  }

  if (state.initPromise) {
    await state.initPromise;
    return state;
  }

  state.initPromise = (async () => {
    const apiKey = process.env.SMARTSPECTRA_API_KEY?.trim() || "";
    if (!apiKey) {
      state.runtimeMode = "serverless-fallback";
      state.lastError = "SMARTSPECTRA_API_KEY is not configured in environment.";
      return;
    }

    try {
      const [sdkMod, msgMod] = await Promise.all([
        import("@smartspectra/node-sdk"),
        import("@smartspectra/node-sdk/messages"),
      ]);

      const {
        SmartSpectraSDK,
        CameraSelection,
        PixelFormat,
        ValidationCode,
        breathingMetrics,
        cardioMetrics,
        faceMetrics,
      } = sdkMod;
      const { decodeMetrics } = msgMod;

      state.sdkVersion = SmartSpectraSDK.version || "3.5.0";
      state.pixelFormatRGBA = PixelFormat?.kRGBA ?? 2;
      state.activeMetrics = {
        breathing: breathingMetrics?.length ?? 3,
        cardio: cardioMetrics?.length ?? 3,
        face: faceMetrics?.length ?? 4,
      };

      try {
        const cams = SmartSpectraSDK.availableCameras?.() || [];
        state.cameras = cams.map((c: { id: string; name: string | null }) => ({
          id: c.id,
          name: c.name,
        }));
      } catch {
        state.cameras = [];
      }

      if (state.sdk) {
        try {
          await state.sdk.destroy();
        } catch {}
        state.sdk = null;
      }

      const sdk = new SmartSpectraSDK({
        apiKey,
        requestedMetrics: [
          ...breathingMetrics,
          ...cardioMetrics,
          ...faceMetrics,
        ],
        enableTelemetry: false,
      });

      sdk.on("processingStatus", (status: number) => {
        broadcast({ type: "processingStatus", status });
      });

      let lastValCode = -1;
      sdk.on(
        "validationStatus",
        (code: number, timestampUs: number, hint: string) => {
          const noFaceCode = ValidationCode?.kNoFaceFound ?? 1;
          if (code !== lastValCode) {
            lastValCode = code;
            console.log(`[SmartSpectra] validation code=${code} hint="${hint || "ok"}"`);
          }
          broadcast({
            type: "validation",
            code,
            hint: hint || "",
            facePresent: code !== noFaceCode,
            timestampUs,
          });
        }
      );

      let lastMetricLogMs = 0;
      sdk.on("metrics", (buf: Buffer, timestampUs: number) => {
        try {
          const decoded = decodeMetrics(buf);

          // 1. Cardio (Pulse Rate, Arterial Pressure Trace, HRV)
          const pulseRates = decoded.cardio?.pulseRate || [];
          const latestPulse =
            pulseRates.length > 0 ? pulseRates[pulseRates.length - 1] : null;
          const pulseTrace = (decoded.cardio?.arterialPressureTrace || [])
            .map((p) => Number(p.value ?? 0))
            .filter((n) => Number.isFinite(n));
          const hrvs = decoded.cardio?.hrv || [];
          const latestHrv = hrvs.length > 0 ? hrvs[hrvs.length - 1] : null;

          // 2. Breathing (Rate & Upper Chest Trace)
          const breathRates = decoded.breathing?.rate || [];
          const latestBreathRate =
            breathRates.length > 0
              ? breathRates[breathRates.length - 1]
              : null;
          const breathingTrace = (decoded.breathing?.upperTrace || [])
            .map((p) => Number(p.value ?? 0))
            .filter((n) => Number.isFinite(n));

          // 3. Facial Expressions
          const exprs = decoded.face?.expression || [];
          const latestExpr = exprs.length > 0 ? exprs[exprs.length - 1] : null;
          let mappedExpression: "calm" | "grin" | "surprised" | null = null;
          let expressionLabel: string | null = null;

          if (latestExpr?.scores && latestExpr.scores.length > 0) {
            let bestType = 6; // NEUTRAL
            let bestConf = -1;
            for (const s of latestExpr.scores) {
              const conf = Number(s.confidence ?? 0);
              const t = Number(s.type ?? 0);
              if (conf > bestConf) {
                bestConf = conf;
                bestType = t;
              }
            }
            expressionLabel = EXPRESSION_NAMES[bestType] || "NEUTRAL";
            if (bestType === 5 && bestConf >= 35) {
              mappedExpression = "grin";
            } else if (bestType === 8 && bestConf >= 35) {
              mappedExpression = "surprised";
            } else {
              mappedExpression = "calm";
            }
          }

          // 4. Facial Landmarks -> Center point
          const landmarksList = decoded.face?.landmarks || [];
          const latestLandmarks =
            landmarksList.length > 0
              ? landmarksList[landmarksList.length - 1]
              : null;
          let landmarkCenter: { x: number; y: number } | null = null;
          if (latestLandmarks?.value && latestLandmarks.value.length > 0) {
            let sumX = 0;
            let sumY = 0;
            for (const pt of latestLandmarks.value) {
              sumX += Number(pt.x ?? 0);
              sumY += Number(pt.y ?? 0);
            }
            landmarkCenter = {
              x: sumX / latestLandmarks.value.length,
              y: sumY / latestLandmarks.value.length,
            };
          }

          const nowMs = Date.now();
          if (nowMs - lastMetricLogMs >= 2000) {
            lastMetricLogMs = nowMs;
            const lmStr = landmarkCenter
              ? `${latestLandmarks?.value?.length ?? 0} (${landmarkCenter.x.toFixed(1)},${landmarkCenter.y.toFixed(1)})`
              : "0";
            console.log(
              `[SmartSpectra] pulse=${latestPulse ? Math.round(Number(latestPulse.value)) : "--"}bpm | breath=${latestBreathRate ? Math.round(Number(latestBreathRate.value)) : "--"}br/m | trace=${pulseTrace.length}/${breathingTrace.length} | expr=${expressionLabel ?? "--"} | lm=${lmStr}`
            );
          }

          broadcast({
            type: "metrics",
            timestampUs,
            pulseBpm:
              latestPulse && Number.isFinite(Number(latestPulse.value))
                ? Math.round(Number(latestPulse.value))
                : null,
            pulseConfidence:
              latestPulse && latestPulse.confidence != null
                ? Number(latestPulse.confidence)
                : null,
            pulseStable: Boolean(latestPulse?.stable),
            pulseTrace: pulseTrace.slice(-24),
            hrvRmssd:
              latestHrv && latestHrv.rmssd != null
                ? Number(latestHrv.rmssd)
                : null,
            breathingRateBpm:
              latestBreathRate &&
              Number.isFinite(Number(latestBreathRate.value))
                ? Math.round(Number(latestBreathRate.value))
                : null,
            breathingConfidence:
              latestBreathRate && latestBreathRate.confidence != null
                ? Number(latestBreathRate.confidence)
                : null,
            breathingTrace: breathingTrace.slice(-24),
            expression: mappedExpression,
            expressionLabel,
            landmarkCenter,
          });
        } catch {
          // Ignore malformed protobuf frame
        }
      });

      sdk.on(
        "error",
        (code: number, message: string, retryable: boolean) => {
          console.error(`[SmartSpectra] SDK error code=${code} retryable=${retryable}: ${message}`);
          state.lastError = message;
          state.running = false;
          broadcast({ type: "sdk_error", code, message, retryable });
        }
      );

      // Capture directly from the native hardware camera at 30 FPS in C++
      // (avoids HTTP frame serialization bottlenecks and guarantees steady 30 FPS for rPPG).
      sdk.useCamera(CameraSelection.default, {
        width: 640,
        height: 480,
        fps: 30,
      });
      sdk.start();

      state.sdk = sdk;
      state.running = true;
      state.runtimeMode = "native-presage-sdk";
      state.lastError = null;
      state.lastTimestampUs = 0;
    } catch (err) {
      state.runtimeMode = "serverless-fallback";
      state.running = false;
      state.lastError =
        err instanceof Error ? err.message : "Failed to initialize native SDK";
    }
  })();

  try {
    await state.initPromise;
  } finally {
    state.initPromise = null;
  }

  return state;
}

export function subscribeSmartSpectra(listener: Listener): () => void {
  const state = getState();
  state.listeners.add(listener);

  return () => {
    state.listeners.delete(listener);
    if (state.listeners.size === 0 && state.sdk) {
      // Grace period before tearing down native pipeline on tab refresh
      state.stopTimer = setTimeout(async () => {
        if (state.listeners.size === 0 && state.sdk) {
          const instance = state.sdk;
          state.sdk = null;
          state.running = false;
          try {
            await instance.stopAsync();
          } catch {}
          try {
            await instance.destroy();
          } catch {}
        }
      }, 2000);
    }
  };
}

export function pushSmartSpectraFrame(
  rgbaBuffer: Buffer,
  width: number,
  height: number,
  timestampUs: number
): boolean {
  const state = getState();
  if (!state.running || !state.sdk) return false;

  // Presage SDK requires strictly monotonically increasing timestamps in microseconds
  const safeTs =
    timestampUs > state.lastTimestampUs
      ? timestampUs
      : state.lastTimestampUs + 33333;
  state.lastTimestampUs = safeTs;

  try {
    return Boolean(
      state.sdk.sendFrame(
        rgbaBuffer,
        width,
        height,
        width * 4,
        state.pixelFormatRGBA,
        safeTs
      )
    );
  } catch {
    return false;
  }
}
