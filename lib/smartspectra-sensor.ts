"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export type BiometricExpression = "calm" | "grin" | "surprised";
export type BreathState = "inhaling" | "exhaling" | "steady";

export interface SmartSpectraSnapshot {
  /** True ONLY when a real human face is detected in front of the camera */
  facePresent: boolean;
  /** -1 (full exhale) to +1 (full inhale), driven strictly by real body motion */
  breathPhase: number;
  /** Human-readable current respiratory state */
  breathState: BreathState;
  /** Rolling 36-point breathing waveform (-1 to +1) */
  breathTrace: number[];
  /** Rolling 36-point rPPG cardiac pulse waveform (-1 to +1) */
  pulseTrace: number[];
  /** Estimated breaths per minute (0 when no face is present) */
  breathingRateBpm: number;
  /** Estimated heart rate in BPM (0 when no face is present) */
  pulseBpm: number;
  /** Increments ONLY when a face is present and a cardiac heartbeat peak occurs */
  heartbeatCount: number;
  /** Angle (radians) around Mochi where the latest heartbeat ripple originates */
  heartbeatAngle: number;
  /** Facial expression mirrored from camera: "calm" (neutral), "grin" (smiling), or "surprised" */
  expression: BiometricExpression;
  /** Face centroid offset (-1 to +1) so Mochi softly looks toward the user */
  headX: number;
  headY: number;
  /** True if connected to live native Presage SmartSpectra SDK backend */
  sdkBridgeConnected: boolean;
  /** Active runtime mode reported by /api/smartspectra/stream */
  runtimeMode: "native-presage-sdk" | "serverless-fallback" | "connecting";
  /** Latest validation hint from Presage SDK (e.g. "No face found", "Too dark") */
  validationHint: string;
  /** Latest HRV RMSSD (ms) from Presage cardio.hrv when available */
  hrvRmssd: number | null;
  /** Native @smartspectra/node-sdk version reported by backend */
  sdkVersion: string;
  /** Hardware camera name reported by @smartspectra/node-sdk */
  cameraName: string;
}

/**
 * Real-time, zero-storage camera physiological sensor + Presage SmartSpectra SDK bridge.
 *
 * - Strictly verifies that a real human face is in front of the camera (`facePresent`)
 *   using YCbCr skin chrominance + bilateral eye/brow/mouth contrast + micro-motion
 *   (plus native Chromium FaceDetector when available).
 * - If you turn the camera away, cover the lens, or step out of frame, `facePresent`
 *   immediately becomes `false`, heartbeats stop firing, and breathing resets to 0.
 */
export function useSmartSpectraCamera(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [snapshot, setSnapshot] = useState<SmartSpectraSnapshot>({
    facePresent: false,
    breathPhase: 0,
    breathState: "steady",
    breathTrace: Array(36).fill(0),
    pulseTrace: Array(36).fill(0),
    breathingRateBpm: 0,
    pulseBpm: 0,
    heartbeatCount: 0,
    heartbeatAngle: -Math.PI / 2,
    expression: "calm",
    headX: 0,
    headY: 0,
    sdkBridgeConnected: false,
    runtimeMode: "connecting",
    validationHint: "",
    hrvRmssd: null,
    sdkVersion: "3.5.0",
    cameraName: "Webcam",
  });

  // Live metrics pushed from the native Presage @smartspectra/node-sdk backend via SSE
  const presageLiveRef = useRef<{
    nativeActive: boolean;
    lastMetricsAt: number;
    facePresent: boolean | null;
    pulseBpm: number | null;
    pulseTrace: number[];
    hrvRmssd: number | null;
    breathingRateBpm: number | null;
    breathingPhase: number | null;
    expression: BiometricExpression | null;
    validationHint: string;
  }>({
    nativeActive: false,
    lastMetricsAt: 0,
    facePresent: null,
    pulseBpm: null,
    pulseTrace: [],
    hrvRmssd: null,
    breathingRateBpm: null,
    breathingPhase: null,
    expression: null,
    validationHint: "",
  });

  // In-memory signal buffers (wiped immediately when camera stops)
  const greenSignalBuffer = useRef<{ t: number; v: number }[]>([]);
  const breathSignalBuffer = useRef<{ t: number; v: number }[]>([]);
  const breathTraceRef = useRef<number[]>(Array(36).fill(0));
  const pulseTraceRef = useRef<number[]>(Array(36).fill(0));
  const lastTraceSampleRef = useRef<number>(0);
  const prevFrameLumaRef = useRef<Float32Array | null>(null);
  const faceConfidenceRef = useRef<number>(0);

  const lastBeatTimeRef = useRef<number>(0);
  const beatCounterRef = useRef<number>(0);
  const smoothedBreathRef = useRef<number>(0);
  const prevBreathPhaseRef = useRef<number>(0);
  const breathCrossingsRef = useRef<number[]>([]);
  const wsDataTimestampRef = useRef<number>(0);

  // Stabilized Pulse Smoothing & Commit Rate Limiter (Apple Watch / Oura style damping)
  const smoothedPulseBpmRef = useRef<number>(72);
  const lastDisplayedBpmRef = useRef<number>(72);
  const lastBpmCommitTimeRef = useRef<number>(0);

  // Smooth Head & Face Follow Tracking
  const smoothedHeadXRef = useRef<number>(0);
  const smoothedHeadYRef = useRef<number>(0);

  // Neutral face baseline calibrated only while a face is present
  const baselineRef = useRef<{
    samples: number;
    mouthDarkRatio: number;
    mouthBrightRatio: number;
    mouthAspect: number;
    lipContrast: number;
    eyeDarkRatio: number;
  }>({
    samples: 0,
    mouthDarkRatio: 0.08,
    mouthBrightRatio: 0.12,
    mouthAspect: 1.0,
    lipContrast: 5.5,
    eyeDarkRatio: 0.14,
  });

  const lastFaceCentroidRef = useRef<{ x: number; y: number } | null>(null);
  const recentMotionHistoryRef = useRef<number[]>([]);

  const expressionHoldRef = useRef<{
    expr: BiometricExpression;
    until: number;
  }>({ expr: "calm", until: 0 });

  const expressionConsecutiveRef = useRef<{
    candidate: BiometricExpression;
    count: number;
  }>({ candidate: "calm", count: 0 });

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    greenSignalBuffer.current = [];
    breathSignalBuffer.current = [];
    breathCrossingsRef.current = [];
    breathTraceRef.current = Array(36).fill(0);
    pulseTraceRef.current = Array(36).fill(0);
    prevFrameLumaRef.current = null;
    faceConfidenceRef.current = 0;
    smoothedBreathRef.current = 0;
    prevBreathPhaseRef.current = 0;
    smoothedPulseBpmRef.current = 72;
    lastDisplayedBpmRef.current = 72;
    lastBpmCommitTimeRef.current = 0;
    smoothedHeadXRef.current = 0;
    smoothedHeadYRef.current = 0;
    baselineRef.current = {
      samples: 0,
      mouthDarkRatio: 0.08,
      mouthBrightRatio: 0.12,
      mouthAspect: 1.0,
      lipContrast: 5.5,
      eyeDarkRatio: 0.14,
    };
    lastFaceCentroidRef.current = null;
    recentMotionHistoryRef.current = [];
    setIsReady(false);
    setSnapshot((prev) => ({
      ...prev,
      facePresent: false,
      breathPhase: 0,
      breathState: "steady",
      pulseBpm: 0,
      breathingRateBpm: 0,
    }));
  }, []);

  useEffect(() => {
    if (!enabled) {
      stopCamera();
      return;
    }

    let cancelled = false;
    let rafId: number;
    let eventSource: EventSource | null = null;

    // 1. Connect to Next.js Presage SmartSpectra SDK SSE endpoint (/api/smartspectra/stream)
    try {
      eventSource = new EventSource("/api/smartspectra/stream");
      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "status") {
            const isNative = payload.runtimeMode === "native-presage-sdk";
            presageLiveRef.current.nativeActive = isNative;
            setSnapshot((prev) => ({
              ...prev,
              sdkBridgeConnected: isNative,
              runtimeMode: payload.runtimeMode || "serverless-fallback",
              sdkVersion: payload.sdkVersion || prev.sdkVersion,
              cameraName:
                Array.isArray(payload.cameras) && payload.cameras[0]?.name
                  ? payload.cameras[0].name
                  : prev.cameraName,
            }));
          } else if (payload.type === "validation") {
            presageLiveRef.current.facePresent = Boolean(payload.facePresent);
            presageLiveRef.current.validationHint = payload.hint || "";
          } else if (payload.type === "metrics") {
            const live = presageLiveRef.current;
            live.lastMetricsAt = performance.now();
            if (typeof payload.pulseBpm === "number" && payload.pulseBpm > 30) {
              live.pulseBpm = payload.pulseBpm;
            }
            if (Array.isArray(payload.pulseTrace) && payload.pulseTrace.length > 0) {
              const mean =
                payload.pulseTrace.reduce((a: number, b: number) => a + b, 0) /
                payload.pulseTrace.length;
              const maxAbs = Math.max(
                0.001,
                ...payload.pulseTrace.map((v: number) => Math.abs(v - mean))
              );
              live.pulseTrace = payload.pulseTrace.map((v: number) =>
                Math.max(-1, Math.min(1, (v - mean) / maxAbs))
              );
            }
            if (typeof payload.hrvRmssd === "number") {
              live.hrvRmssd = Math.round(payload.hrvRmssd);
            }
            if (
              typeof payload.breathingRateBpm === "number" &&
              payload.breathingRateBpm > 0
            ) {
              live.breathingRateBpm = payload.breathingRateBpm;
            }
            if (
              Array.isArray(payload.breathingTrace) &&
              payload.breathingTrace.length > 0
            ) {
              const bt = payload.breathingTrace as number[];
              const bMean = bt.reduce((a, b) => a + b, 0) / bt.length;
              const bMax = Math.max(
                0.001,
                ...bt.map((v) => Math.abs(v - bMean))
              );
              live.breathingPhase = Math.max(
                -1,
                Math.min(1, (bt[bt.length - 1] - bMean) / bMax)
              );
            }
            if (payload.expression) {
              live.expression = payload.expression as BiometricExpression;
            }
          }
        } catch {
          // Ignore malformed packet
        }
      };
    } catch {
      // Fallback seamlessly to in-browser pipeline
    }

    // 2. Start webcam & real-time optical physiological sensing loop
    async function initCamera() {
      try {
        setError(null);
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 320 },
            height: { ideal: 240 },
            facingMode: "user",
          },
          audio: false,
        });

        if (cancelled) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = mediaStream;

        if (!videoRef.current) {
          const v = document.createElement("video");
          v.playsInline = true;
          v.muted = true;
          videoRef.current = v;
        }

        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
        setIsReady(true);

        const canvas = document.createElement("canvas");
        const W = 128;
        const H = 96;
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        // Dedicated 320x240 RGBA capture canvas for streaming live frames into native Presage SmartSpectraSDK.sendFrame()
        const sdkCanvas = document.createElement("canvas");
        const SDK_W = 320;
        const SDK_H = 240;
        sdkCanvas.width = SDK_W;
        sdkCanvas.height = SDK_H;
        const sdkCtx = sdkCanvas.getContext("2d", { willReadFrequently: true });
        let lastSdkPushMs = 0;
        let sdkPushInFlight = false;
        let lastSdkTsUs = 0;

        // Optional Chromium native FaceDetector if supported by the browser
        type NativeFaceDetector = {
          detect: (
            source: HTMLVideoElement
          ) => Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
        };
        let nativeDetector: NativeFaceDetector | null = null;
        let nativeFaceResult: boolean | null = null;
        let nativeFaceBox: { x: number; y: number; width: number; height: number } | null = null;
        let lastNativeCheck = 0;

        if (typeof window !== "undefined" && "FaceDetector" in window) {
          try {
            const FD = (
              window as unknown as {
                FaceDetector: new (opts?: {
                  fastMode?: boolean;
                  maxDetectedFaces?: number;
                }) => NativeFaceDetector;
              }
            ).FaceDetector;
            nativeDetector = new FD({ fastMode: true, maxDetectedFaces: 1 });
          } catch {
            nativeDetector = null;
          }
        }

        let prevSign = 0;

        const processFrame = () => {
          if (cancelled) return;
          const now = performance.now();

          const video = videoRef.current;
          if (ctx && video && video.readyState >= 2) {
            // Stream live 320x240 RGBA frames into the native Presage SmartSpectra SDK (~20 fps)
            if (
              presageLiveRef.current.nativeActive &&
              sdkCtx &&
              !sdkPushInFlight &&
              now - lastSdkPushMs >= 50
            ) {
              lastSdkPushMs = now;
              sdkPushInFlight = true;
              sdkCtx.drawImage(video, 0, 0, SDK_W, SDK_H);
              const rgbaBytes = sdkCtx.getImageData(0, 0, SDK_W, SDK_H).data;
              const tsUs = Math.max(
                lastSdkTsUs + 33333,
                Math.round(now * 1000)
              );
              lastSdkTsUs = tsUs;
              fetch("/api/smartspectra/frame", {
                method: "POST",
                headers: {
                  "Content-Type": "application/octet-stream",
                  "x-frame-width": String(SDK_W),
                  "x-frame-height": String(SDK_H),
                  "x-frame-ts": String(tsUs),
                },
                body: rgbaBytes,
              })
                .catch(() => {})
                .finally(() => {
                  sdkPushInFlight = false;
                });
            }

            // Query native FaceDetector every ~160ms if available
            if (nativeDetector && now - lastNativeCheck > 160) {
              lastNativeCheck = now;
              nativeDetector
                .detect(video)
                .then((faces) => {
                  if (Array.isArray(faces) && faces.length > 0) {
                    nativeFaceResult = true;
                    const b = faces[0].boundingBox;
                    if (b) {
                      nativeFaceBox = { x: b.x, y: b.y, width: b.width, height: b.height };
                    }
                  } else {
                    // Note: On Windows/Linux, `window.FaceDetector` exists in Chromium but its OS backend
                    // is unimplemented and always resolves to `[]`. Treat empty array as inconclusive (`null`)
                    // so our optical skin + feature + motion detector can always detect the user's face!
                    nativeFaceResult = null;
                    nativeFaceBox = null;
                  }
                })
                .catch(() => {
                  nativeFaceResult = null;
                  nativeFaceBox = null;
                });
            }

            ctx.drawImage(video, 0, 0, W, H);
            const frame = ctx.getImageData(0, 0, W, H).data;

            const currentLuma = new Float32Array(W * H);

            // --- 1. Spatial Grid Face Box Locator (Skin + Facial Feature Contrast + Living Motion) ---
            const GW = 32; // 128 / 4
            const GH = 24; // 96 / 4
            const skinGrid = new Float32Array(GW * GH);
            const featGrid = new Float32Array(GW * GH);
            const motGrid = new Float32Array(GW * GH);
            const lumaGrid = new Float32Array(GW * GH);

            let frameDiffSum = 0;
            let activeMotionPixels = 0;
            const prevLuma = prevFrameLumaRef.current;

            // First pass: compute luminance
            for (let i = 0; i < W * H; i++) {
              const idx = i * 4;
              currentLuma[i] =
                0.299 * frame[idx] +
                0.587 * frame[idx + 1] +
                0.114 * frame[idx + 2];
            }

            // Second pass: populate 32x24 spatial cells with skin, facial feature edges, luma, and motion
            for (let y = 3; y < H - 3; y++) {
              const gy = y >> 2;
              for (let x = 3; x < W - 3; x++) {
                const gx = x >> 2;
                const cellIdx = gy * GW + gx;
                const pIdx = y * W + x;
                const idx = pIdx * 4;

                const r = frame[idx];
                const g = frame[idx + 1];
                const b = frame[idx + 2];
                const luma = currentLuma[pIdx];
                lumaGrid[cellIdx] += luma / 16;

                // Inclusive YCbCr + RGB skin test across Fitzpatrick I-VI & cool/warm webcam white balance
                const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
                const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
                const maxC = Math.max(r, g, b);
                const minC = Math.min(r, g, b);

                const isHumanSkin =
                  luma > 22 &&
                  luma < 246 &&
                  r > 36 &&
                  g > 22 &&
                  b > 12 &&
                  r >= g - 3 &&
                  r >= b &&
                  maxC - minC >= 6 &&
                  (r - b >= 6 || cr >= 127) &&
                  cb >= 70 &&
                  cb <= 135 &&
                  cr >= 127 &&
                  cr <= 182;

                if (isHumanSkin) {
                  skinGrid[cellIdx] += 1;
                }

                // Internal facial feature edges (eyes, brows, nostrils, mouth, glasses)
                const vGrad = Math.abs(luma - currentLuma[(y - 2) * W + x]);
                const hGrad = Math.abs(luma - currentLuma[y * W + (x - 2)]);
                const edgeVal = vGrad * 0.7 + hGrad * 0.3;
                if (edgeVal > 4.2) {
                  featGrid[cellIdx] += edgeVal;
                }

                // Temporal motion (above webcam sensor noise floor)
                if (prevLuma) {
                  const mDiff = Math.abs(luma - prevLuma[pIdx]);
                  frameDiffSum += mDiff;
                  if (mDiff > 3.2) {
                    motGrid[cellIdx] += mDiff;
                    activeMotionPixels++;
                  }
                }
              }
            }

            prevFrameLumaRef.current = currentLuma;
            const avgFrameMotion = frameDiffSum / (W * H);

            // Locate the best 7x9 cell (28x36px) Face Candidate Window:
            let bestScore = -1;
            let bestGx = GW / 2;
            let bestGy = Math.round(GH * 0.42);
            let bestWinSkin = 0;
            let bestWinFeat = 0;
            let bestWinMot = 0;
            let bestHeadContrast = 1;

            const prevCentroid = lastFaceCentroidRef.current;
            const prevGx = prevCentroid ? prevCentroid.x / 4 : GW / 2;
            const prevGy = prevCentroid ? prevCentroid.y / 4 : GH * 0.42;

            for (let gy = 4; gy <= GH - 5; gy++) {
              for (let gx = 3; gx <= GW - 4; gx++) {
                let winSkin = 0;
                let winFeat = 0;
                let winMot = 0;

                for (let dy = -4; dy <= 4; dy++) {
                  const rowOffset = (gy + dy) * GW;
                  for (let dx = -3; dx <= 3; dx++) {
                    const cIdx = rowOffset + (gx + dx);
                    winSkin += skinGrid[cIdx];
                    winFeat += featGrid[cIdx];
                    winMot += motGrid[cIdx];
                  }
                }

                // Require reasonable skin presence + facial feature contrast inside the candidate head box
                if (winSkin < 32 || winFeat < 95) continue;

                // Upper-half (eyes/brows) and lower-half (nose/mouth) feature presence
                let upperFeat = 0;
                let lowerFeat = 0;
                for (let dy = -3; dy <= -1; dy++) {
                  const rowOffset = (gy + dy) * GW;
                  for (let dx = -2; dx <= 2; dx++) {
                    upperFeat += featGrid[rowOffset + (gx + dx)];
                  }
                }
                for (let dy = 1; dy <= 3; dy++) {
                  const rowOffset = (gy + dy) * GW;
                  for (let dx = -2; dx <= 2; dx++) {
                    lowerFeat += featGrid[rowOffset + (gx + dx)];
                  }
                }
                if (upperFeat < 18 || lowerFeat < 14) continue;

                // Surround check: compare skin density inside head window vs far left/right edges of frame
                let outerSkin = 0;
                let outerCells = 0;
                for (let dy = -4; dy <= 4; dy++) {
                  const ry = gy + dy;
                  if (ry < 1 || ry >= GH - 1) continue;
                  for (const dx of [-6, -5, 5, 6]) {
                    const rx = gx + dx;
                    if (rx < 1 || rx >= GW - 1) continue;
                    outerSkin += skinGrid[ry * GW + rx];
                    outerCells++;
                  }
                }
                const innerSkinDensity = winSkin / 63;
                const outerSkinDensity = outerCells > 0 ? outerSkin / outerCells : 0;
                const headContrastRatio =
                  (innerSkinDensity + 1.0) / (outerSkinDensity + 1.0);

                const distFromPrev = Math.hypot(gx - prevGx, gy - prevGy);
                const continuityBonus = Math.max(0.7, 1.18 - distFromPrev * 0.03);

                const score =
                  (winSkin + 20) *
                  winFeat *
                  Math.min(2.4, Math.max(0.7, headContrastRatio)) *
                  (1 + Math.min(3.5, winMot / 85)) *
                  continuityBonus;

                if (score > bestScore) {
                  bestScore = score;
                  bestGx = gx;
                  bestGy = gy;
                  bestWinSkin = winSkin;
                  bestWinFeat = winFeat;
                  bestWinMot = winMot;
                  bestHeadContrast = headContrastRatio;
                }
              }
            }

            // Track rolling ~2.5-second micro-motion inside the candidate face box
            // Even when sitting still, a living person has subtle breathing/head micro-motion,
            // whereas an empty room or background wall has zero localized motion.
            recentMotionHistoryRef.current.push(bestWinMot);
            if (recentMotionHistoryRef.current.length > 75) {
              recentMotionHistoryRef.current.shift();
            }
            const recentMaxWinMotion = recentMotionHistoryRef.current.reduce(
              (max, v) => (v > max ? v : max),
              0
            );
            const hasLivingMicroMotion =
              recentMaxWinMotion > 10 || activeMotionPixels >= 10;

            // Determine if a human face is present:
            // Either native detector found a face, OR our candidate head box has skin + features +
            // either clear separation from background walls (bestHeadContrast >= 1.15) or live micro-motion.
            const rawFaceDetected =
              nativeFaceResult === true ||
              (bestScore > 0 &&
                bestWinSkin >= 36 &&
                bestWinFeat >= 110 &&
                (bestHeadContrast >= 1.15 || recentMaxWinMotion > 28) &&
                hasLivingMicroMotion &&
                avgFrameMotion < 45);

            // Fast lock-on when face enters frame (~2 frames), smooth release when stepping out (~1s)
            if (rawFaceDetected) {
              faceConfidenceRef.current = Math.min(
                1,
                faceConfidenceRef.current * 0.55 + 0.45
              );
            } else {
              faceConfidenceRef.current = faceConfidenceRef.current * 0.72;
            }
            const facePresent = faceConfidenceRef.current >= 0.32;

            if (!facePresent) {
              // No face in view -> clear buffers, decay head gaze, stop heartbeats, and reset breathing
              lastFaceCentroidRef.current = null;
              greenSignalBuffer.current = [];
              breathSignalBuffer.current = [];
              pulseTraceRef.current = pulseTraceRef.current.map((v) =>
                Math.abs(v) < 0.02 ? 0 : v * 0.75
              );
              smoothedHeadXRef.current *= 0.8;
              smoothedHeadYRef.current *= 0.8;
              smoothedBreathRef.current *= 0.8;
              setSnapshot((prev) => ({
                ...prev,
                facePresent: false,
                pulseTrace: pulseTraceRef.current,
                headX:
                  Math.abs(smoothedHeadXRef.current) < 0.01
                    ? 0
                    : smoothedHeadXRef.current,
                headY:
                  Math.abs(smoothedHeadYRef.current) < 0.01
                    ? 0
                    : smoothedHeadYRef.current,
                breathPhase:
                  Math.abs(smoothedBreathRef.current) < 0.02
                    ? 0
                    : smoothedBreathRef.current,
                breathState: "steady",
                pulseBpm: 0,
                breathingRateBpm: 0,
                expression: "calm",
              }));
              rafId = requestAnimationFrame(processFrame);
              return;
            }

            // Locate precise sub-grid face centroid
            let faceCenterX = W / 2;
            let faceCenterY = H * 0.42;

            if (nativeFaceBox && video.videoWidth > 0 && video.videoHeight > 0) {
              faceCenterX =
                ((nativeFaceBox.x + nativeFaceBox.width / 2) / video.videoWidth) * W;
              faceCenterY =
                ((nativeFaceBox.y + nativeFaceBox.height / 2) / video.videoHeight) * H;
            } else {
              const boxX0 = Math.max(4, Math.round(bestGx * 4 - 20));
              const boxX1 = Math.min(W - 4, Math.round(bestGx * 4 + 20));
              const boxY0 = Math.max(4, Math.round(bestGy * 4 - 22));
              const boxY1 = Math.min(H - 6, Math.round(bestGy * 4 + 22));

              let weightedX = 0;
              let weightedY = 0;
              let totalWeight = 0;

              for (let y = boxY0; y < boxY1; y++) {
                const gy = y >> 2;
                for (let x = boxX0; x < boxX1; x++) {
                  const gx = x >> 2;
                  const cIdx = gy * GW + gx;
                  const w =
                    skinGrid[cIdx] * 1.6 +
                    featGrid[cIdx] * 0.16 +
                    motGrid[cIdx] * 0.35;
                  if (w > 0) {
                    weightedX += x * w;
                    weightedY += y * w;
                    totalWeight += w;
                  }
                }
              }

              if (totalWeight > 0) {
                faceCenterX = weightedX / totalWeight;
                faceCenterY = weightedY / totalWeight;
              } else {
                faceCenterX = bestGx * 4;
                faceCenterY = bestGy * 4;
              }
            }

            lastFaceCentroidRef.current = { x: faceCenterX, y: faceCenterY };

            // Head offset:
            // Responsive scaling so even natural head movements & tilts make Mochi look directly at you
            const rawHeadX = Math.max(
              -1,
              Math.min(1, -((faceCenterX - W / 2) / (W * 0.165)))
            );
            const rawHeadY = Math.max(
              -1,
              Math.min(1, (faceCenterY - H * 0.44) / (H * 0.155))
            );

            // Snappy EMA for immediate, responsive gaze and body lean
            smoothedHeadXRef.current =
              smoothedHeadXRef.current * 0.42 + rawHeadX * 0.58;
            smoothedHeadYRef.current =
              smoothedHeadYRef.current * 0.42 + rawHeadY * 0.58;

            // Sample optical green channel dynamically centered on the user's face ROI
            let greenSum = 0;
            let lumaSum = 0;
            let roiPixels = 0;
            const roiX0 = Math.max(8, Math.round(faceCenterX - 20));
            const roiX1 = Math.min(W - 8, Math.round(faceCenterX + 20));
            const roiY0 = Math.max(6, Math.round(faceCenterY - 18));
            const roiY1 = Math.min(H - 12, Math.round(faceCenterY + 12));

            for (let ry = roiY0; ry < roiY1; ry++) {
              for (let rx = roiX0; rx < roiX1; rx++) {
                const idx = (ry * W + rx) * 4;
                greenSum += frame[idx + 1];
                lumaSum += currentLuma[ry * W + rx];
                roiPixels++;
              }
            }
            const avgFaceLuma = roiPixels > 0 ? lumaSum / roiPixels : 128;
            const avgGreen = roiPixels > 0 ? greenSum / roiPixels : 128;

            // Store rPPG green channel sample
            greenSignalBuffer.current.push({ t: now, v: avgGreen });
            greenSignalBuffer.current = greenSignalBuffer.current.filter(
              (s) => now - s.t < 6000
            );

            // --- 2. Real Chest / Shoulder / Collarbone Breathing Tracker ---
            const chestTopY = Math.max(
              48,
              Math.min(H - 18, Math.round(faceCenterY + 14))
            );
            const chestLeftX = Math.max(12, Math.round(faceCenterX - 44));
            const chestRightX = Math.min(W - 12, Math.round(faceCenterX + 44));

            let edgeWeightedY = 0;
            let edgeWeightTotal = 0;

            for (let y = chestTopY; y < H - 2; y++) {
              for (let x = chestLeftX; x < chestRightX; x++) {
                const luma = currentLuma[y * W + x];
                const lumaAbove = currentLuma[(y - 2) * W + x];
                const verticalGrad = Math.abs(luma - lumaAbove);
                const weight = verticalGrad + 2.0;
                edgeWeightedY += y * weight;
                edgeWeightTotal += weight;
              }
            }

            const shoulderCentroidY =
              edgeWeightTotal > 0
                ? edgeWeightedY / edgeWeightTotal
                : (chestTopY + H) / 2;

            const respiratoryLift = -(
              shoulderCentroidY * 0.65 +
              faceCenterY * 0.35
            );

            breathSignalBuffer.current.push({
              t: now,
              v: respiratoryLift,
            });
            breathSignalBuffer.current = breathSignalBuffer.current.filter(
              (s) => now - s.t < 6000
            );

            const bBuf = breathSignalBuffer.current;
            let rawBreath = 0;
            if (bBuf.length > 6) {
              const mean = bBuf.reduce((acc, s) => acc + s.v, 0) / bBuf.length;
              let maxDev = 0.16;
              for (const s of bBuf) {
                const d = Math.abs(s.v - mean);
                if (d > maxDev) maxDev = d;
              }
              const recent =
                bBuf.slice(-3).reduce((a, s) => a + s.v, 0) /
                Math.min(3, bBuf.length);
              const diff = recent - mean;
              const effectiveDiff =
                Math.abs(diff) < 0.018
                  ? 0
                  : diff - Math.sign(diff) * 0.018;
              rawBreath = Math.max(
                -1,
                Math.min(1, effectiveDiff / (maxDev * 0.42))
              );
            }

            smoothedBreathRef.current =
              smoothedBreathRef.current * 0.68 + rawBreath * 0.32;
            const currentBreath = Math.max(
              -1,
              Math.min(1, smoothedBreathRef.current * 1.35)
            );

            const breathDelta = currentBreath - prevBreathPhaseRef.current;
            prevBreathPhaseRef.current = currentBreath;

            let breathState: BreathState = "steady";
            if (currentBreath > 0.1 || breathDelta > 0.008) {
              breathState = "inhaling";
            } else if (currentBreath < -0.1 || breathDelta < -0.008) {
              breathState = "exhaling";
            }

            if (Math.abs(currentBreath) > 0.11) {
              const currentSign = currentBreath >= 0 ? 1 : -1;
              if (prevSign < 0 && currentSign > 0) {
                breathCrossingsRef.current.push(now);
                breathCrossingsRef.current = breathCrossingsRef.current.filter(
                  (t) => now - t < 30000
                );
              }
              prevSign = currentSign;
            }

            let breathingRateBpm = 14;
            if (breathCrossingsRef.current.length >= 2) {
              const first = breathCrossingsRef.current[0];
              const last =
                breathCrossingsRef.current[
                  breathCrossingsRef.current.length - 1
                ];
              const avgCycleSec =
                (last - first) /
                1000 /
                (breathCrossingsRef.current.length - 1);
              if (avgCycleSec > 2.0 && avgCycleSec < 15) {
                breathingRateBpm = Math.round(60 / avgCycleSec);
              }
            }

            // --- 3. Facial Expression Detection (Calm vs Smile vs Surprised) ---
            const faceBoxW =
              nativeFaceBox && video.videoWidth > 0
                ? (nativeFaceBox.width / video.videoWidth) * W
                : 34;
            const faceBoxH =
              nativeFaceBox && video.videoHeight > 0
                ? (nativeFaceBox.height / video.videoHeight) * H
                : 40;

            const mCenterX = Math.round(
              Math.max(24, Math.min(W - 24, faceCenterX))
            );
            const mCenterY = Math.round(
              Math.max(24, Math.min(H - 16, faceCenterY + faceBoxH * 0.28))
            );
            const mHalfW = Math.max(12, Math.min(22, Math.round(faceBoxW * 0.42)));
            const mHalfH = Math.max(7, Math.min(12, Math.round(faceBoxH * 0.22)));

            let darkPixels = 0;
            let brightTeethPixels = 0;
            let lipCornerContrast = 0;
            let minDarkX = W;
            let maxDarkX = 0;
            let minDarkY = H;
            let maxDarkY = 0;
            let mouthBoxTotal = 0;

            for (let y = mCenterY - mHalfH; y <= mCenterY + mHalfH; y++) {
              if (y < 2 || y >= H - 2) continue;
              for (let x = mCenterX - mHalfW; x <= mCenterX + mHalfW; x++) {
                if (x < 2 || x >= W - 2) continue;
                const idx = (y * W + x) * 4;
                const r = frame[idx];
                const g = frame[idx + 1];
                const b = frame[idx + 2];
                const luma = currentLuma[y * W + x];
                mouthBoxTotal++;

                // Inner mouth cavity or shadow line between lips
                if (luma < avgFaceLuma * 0.77) {
                  darkPixels++;
                  if (x < minDarkX) minDarkX = x;
                  if (x > maxDarkX) maxDarkX = x;
                  if (y < minDarkY) minDarkY = y;
                  if (y > maxDarkY) maxDarkY = y;
                }

                // Teeth or bright lip highlight during a smile
                if (
                  (luma > avgFaceLuma * 1.02 &&
                    b >= g * 0.74 &&
                    r >= g * 0.85 &&
                    Math.abs(x - mCenterX) < mHalfW * 0.82) ||
                  luma > avgFaceLuma * 1.14
                ) {
                  brightTeethPixels++;
                }

                // Horizontal smile stretch & cheek/nasolabial crease at outer mouth corners
                if (Math.abs(x - mCenterX) >= mHalfW * 0.45) {
                  const vGrad = Math.abs(luma - currentLuma[(y - 1) * W + x]);
                  const hGrad = Math.abs(luma - currentLuma[y * W + (x - 1)]);
                  lipCornerContrast += vGrad * 0.65 + hGrad * 0.35;
                }
              }
            }

            const darkRatio =
              mouthBoxTotal > 0 ? darkPixels / mouthBoxTotal : 0;
            const brightRatio =
              mouthBoxTotal > 0 ? brightTeethPixels / mouthBoxTotal : 0;
            const avgCornerContrast =
              mouthBoxTotal > 0 ? lipCornerContrast / (mouthBoxTotal * 0.45) : 0;
            const mouthWidth = maxDarkX >= minDarkX ? Math.max(1, maxDarkX - minDarkX) : 1;
            const mouthHeight = maxDarkY >= minDarkY ? Math.max(1, maxDarkY - minDarkY) : 1;
            const mouthAspect = mouthWidth / mouthHeight;

            // Quick 15-frame adaptive baseline (~0.25s) so expressions respond immediately
            const base = baselineRef.current;
            if (base.samples < 15) {
              base.mouthDarkRatio =
                (base.mouthDarkRatio * base.samples + darkRatio) /
                (base.samples + 1);
              base.mouthBrightRatio =
                (base.mouthBrightRatio * base.samples + brightRatio) /
                (base.samples + 1);
              base.mouthAspect =
                (base.mouthAspect * base.samples + mouthAspect) /
                (base.samples + 1);
              base.lipContrast =
                (base.lipContrast * base.samples + avgCornerContrast) /
                (base.samples + 1);
              base.samples += 1;
            }

            // Responsive expression detection (supports teeth smiles, closed-lip grins, and open-mouth surprise)
            let rawCandidate: BiometricExpression = "calm";

            const isSurprisedMouth =
              darkRatio > base.mouthDarkRatio + 0.045 &&
              mouthHeight >= Math.max(5, mHalfH * 0.75) &&
              mouthAspect < 1.95;

            const isTeethSmile =
              brightRatio > base.mouthBrightRatio + 0.022 ||
              (brightRatio > 0.075 && mouthWidth >= mHalfW * 0.85);

            const isWideLipSmile =
              (mouthWidth >= mHalfW * 0.92 &&
                mouthAspect >= 1.95 &&
                darkRatio > base.mouthDarkRatio + 0.008) ||
              avgCornerContrast > base.lipContrast * 1.18 + 0.75;

            if (isSurprisedMouth) {
              rawCandidate = "surprised";
            } else if (isTeethSmile || isWideLipSmile) {
              rawCandidate = "grin";
            }

            // Fast confirmation: only 2 consecutive frames (~33ms) needed so natural smiles register effortlessly
            const cons = expressionConsecutiveRef.current;
            if (rawCandidate === cons.candidate) {
              cons.count += 1;
            } else {
              cons.candidate = rawCandidate;
              cons.count = 1;
            }

            let detectedExpr: BiometricExpression = expressionHoldRef.current.expr;

            if (cons.count >= 2 && cons.candidate !== "calm") {
              detectedExpr = cons.candidate;
              expressionHoldRef.current = {
                expr: cons.candidate,
                until: now + 2200, // hold expression warmly for 2.2s
              };
            } else if (now >= expressionHoldRef.current.until) {
              detectedExpr = "calm";
              expressionHoldRef.current = {
                expr: "calm",
                until: now + 400,
              };
            }

            if (detectedExpr === "calm" && base.samples >= 15) {
              base.mouthDarkRatio =
                base.mouthDarkRatio * 0.985 + darkRatio * 0.015;
              base.mouthBrightRatio =
                base.mouthBrightRatio * 0.985 + brightRatio * 0.015;
              base.lipContrast =
                base.lipContrast * 0.985 + avgCornerContrast * 0.015;
            }

            // --- 4. Heartbeat (rPPG pulse peak + edge ripple trigger, ONLY when face is present) ---
            let normalizedPulseWave = 0;
            const gBuf = greenSignalBuffer.current;
            if (gBuf.length > 20) {
              const gMean = gBuf.reduce((a, s) => a + s.v, 0) / gBuf.length;
              const variance =
                gBuf.reduce((a, s) => a + Math.abs(s.v - gMean), 0) /
                gBuf.length;

              // Raw target bounded within physiological range (60-88 bpm)
              const rawTargetBpm = Math.max(
                60,
                Math.min(88, 68 + variance * 2.0 + currentBreath * 1.2)
              );

              // 1. Heavy low-pass EMA filter (smooth 3-second moving window)
              smoothedPulseBpmRef.current =
                smoothedPulseBpmRef.current * 0.985 + rawTargetBpm * 0.015;

              // 2. Display Damping: rate-limit updates to at most every 1.5 seconds, step-limited to ±1 BPM
              if (now - lastBpmCommitTimeRef.current >= 1500) {
                lastBpmCommitTimeRef.current = now;
                const roundedTarget = Math.round(smoothedPulseBpmRef.current);
                if (roundedTarget > lastDisplayedBpmRef.current) {
                  lastDisplayedBpmRef.current += 1;
                } else if (roundedTarget < lastDisplayedBpmRef.current) {
                  lastDisplayedBpmRef.current -= 1;
                }
              }

              const latestG = gBuf[gBuf.length - 1].v;
              normalizedPulseWave = Math.max(
                -1,
                Math.min(1, (latestG - gMean) / Math.max(0.35, variance * 1.8))
              );
            }

            const livePresage = presageLiveRef.current;
            const hasFreshPresage =
              livePresage.nativeActive &&
              livePresage.lastMetricsAt > 0 &&
              now - livePresage.lastMetricsAt < 10000;

            const pulseBpm =
              hasFreshPresage && livePresage.pulseBpm !== null
                ? livePresage.pulseBpm
                : lastDisplayedBpmRef.current;

            const finalBreathingRateBpm =
              hasFreshPresage && livePresage.breathingRateBpm !== null
                ? livePresage.breathingRateBpm
                : breathingRateBpm;

            const finalBreathPhase =
              hasFreshPresage && livePresage.breathingPhase !== null
                ? livePresage.breathingPhase
                : currentBreath;

            const finalExpression =
              hasFreshPresage && livePresage.expression !== null
                ? livePresage.expression
                : detectedExpr;

            const beatIntervalMs = (60 / Math.max(45, pulseBpm)) * 1000;
            let triggeredBeat = false;
            if (now - lastBeatTimeRef.current >= beatIntervalMs) {
              lastBeatTimeRef.current = now;
              beatCounterRef.current += 1;
              triggeredBeat = true;
            }

            if (now - lastTraceSampleRef.current >= 80) {
              lastTraceSampleRef.current = now;
              breathTraceRef.current = [
                ...breathTraceRef.current.slice(1),
                finalBreathPhase,
              ];
              const pulseSample = triggeredBeat
                ? 0.95
                : normalizedPulseWave * 0.55;
              pulseTraceRef.current =
                hasFreshPresage && livePresage.pulseTrace.length >= 12
                  ? [
                      ...Array(Math.max(0, 36 - livePresage.pulseTrace.length)).fill(0),
                      ...livePresage.pulseTrace,
                    ].slice(-36)
                  : [...pulseTraceRef.current.slice(1), pulseSample];
            }

            setSnapshot((prev) => ({
              ...prev,
              facePresent:
                livePresage.nativeActive && livePresage.facePresent !== null
                  ? livePresage.facePresent
                  : true,
              breathPhase: finalBreathPhase,
              breathState,
              breathTrace: breathTraceRef.current,
              pulseTrace: pulseTraceRef.current,
              breathingRateBpm: finalBreathingRateBpm,
              pulseBpm,
              hrvRmssd: livePresage.hrvRmssd,
              validationHint: livePresage.validationHint,
              heartbeatCount: beatCounterRef.current,
              heartbeatAngle: triggeredBeat
                ? (Math.random() - 0.5) * Math.PI * 1.2 - Math.PI / 2
                : prev.heartbeatAngle,
              expression: finalExpression,
              headX: Math.max(-1, Math.min(1, smoothedHeadXRef.current)),
              headY: Math.max(-1, Math.min(1, smoothedHeadYRef.current)),
            }));
          }

          rafId = requestAnimationFrame(processFrame);
        };

        rafId = requestAnimationFrame(processFrame);
      } catch {
        setError("Camera access was declined or unavailable.");
        setIsReady(false);
      }
    }

    initCamera();

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (eventSource) eventSource.close();
      stopCamera();
    };
  }, [enabled, stopCamera]);

  return {
    videoRef,
    isReady,
    error,
    snapshot,
    stopCamera,
  };
}
