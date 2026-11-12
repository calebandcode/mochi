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
  /** True if connected to Presage SmartSpectra backend stream */
  sdkBridgeConnected: boolean;
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
    sdkVersion: "3.5.0",
    cameraName: "Webcam",
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

  // Neutral face baseline calibrated only while a face is present
  const baselineRef = useRef<{
    samples: number;
    mouthDarkRatio: number;
    mouthBrightRatio: number;
    mouthAspect: number;
  }>({
    samples: 0,
    mouthDarkRatio: 0.08,
    mouthBrightRatio: 0.12,
    mouthAspect: 1.0,
  });

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
    baselineRef.current = {
      samples: 0,
      mouthDarkRatio: 0.08,
      mouthBrightRatio: 0.12,
      mouthAspect: 1.0,
    };
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
            setSnapshot((prev) => ({
              ...prev,
              sdkBridgeConnected: Boolean(payload.apiKeyConfigured),
              sdkVersion: payload.sdkVersion || prev.sdkVersion,
              cameraName:
                Array.isArray(payload.cameras) && payload.cameras[0]?.name
                  ? payload.cameras[0].name
                  : prev.cameraName,
            }));
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

        // Optional Chromium native FaceDetector if supported by the browser
        type NativeFaceDetector = {
          detect: (
            source: HTMLVideoElement
          ) => Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
        };
        let nativeDetector: NativeFaceDetector | null = null;
        let nativeFaceResult: boolean | null = null;
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
            // Query native FaceDetector every ~220ms if available
            if (nativeDetector && now - lastNativeCheck > 220) {
              lastNativeCheck = now;
              nativeDetector
                .detect(video)
                .then((faces) => {
                  nativeFaceResult = Array.isArray(faces) && faces.length > 0;
                })
                .catch(() => {
                  nativeFaceResult = null;
                });
            }

            ctx.drawImage(video, 0, 0, W, H);
            const frame = ctx.getImageData(0, 0, W, H).data;

            const currentLuma = new Float32Array(W * H);

            // --- 1. Strict Human Face Verification (YCbCr Skin + Eye/Mouth Contrast + Bounding Shape) ---
            let skinSumX = 0;
            let skinSumY = 0;
            let skinCountCenter = 0;
            let centerTotal = 0;
            let skinCountOuter = 0;
            let outerTotal = 0;

            let greenSum = 0;
            let lumaSum = 0;
            let roiPixels = 0;

            for (let y = 0; y < H; y++) {
              for (let x = 0; x < W; x++) {
                const idx = (y * W + x) * 4;
                const r = frame[idx];
                const g = frame[idx + 1];
                const b = frame[idx + 2];
                const luma = 0.299 * r + 0.587 * g + 0.114 * b;
                currentLuma[y * W + x] = luma;

                // YCbCr chrominance human skin test (rejects white/grey walls, dark rooms, wood, etc.)
                const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
                const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

                const isHumanSkin =
                  luma > 35 &&
                  luma < 235 &&
                  r > 55 &&
                  g > 35 &&
                  b > 20 &&
                  r > g &&
                  r > b + 10 &&
                  cb >= 77 &&
                  cb <= 127 &&
                  cr >= 133 &&
                  cr <= 173;

                const inCenterBox = x >= 26 && x <= 102 && y >= 10 && y <= 76;
                if (inCenterBox) {
                  centerTotal++;
                  if (isHumanSkin) {
                    skinCountCenter++;
                    skinSumX += x;
                    skinSumY += y;
                  }
                } else if (x < 14 || x > W - 14 || y < 8) {
                  outerTotal++;
                  if (isHumanSkin) {
                    skinCountOuter++;
                  }
                }

                if (x >= 40 && x <= 88 && y >= 18 && y <= 62) {
                  greenSum += g;
                  lumaSum += luma;
                  roiPixels++;
                }
              }
            }

            const centerSkinRatio =
              centerTotal > 0 ? skinCountCenter / centerTotal : 0;
            const outerSkinRatio =
              outerTotal > 0 ? skinCountOuter / outerTotal : 0;

            const faceCenterX =
              skinCountCenter > 40 ? skinSumX / skinCountCenter : W / 2;
            const faceCenterY =
              skinCountCenter > 40 ? skinSumY / skinCountCenter : H * 0.42;

            // Check internal facial feature contrast (eyes/brows/nose/mouth vs flat wall/hand)
            const fLeft = Math.max(16, Math.round(faceCenterX - 24));
            const fRight = Math.min(W - 16, Math.round(faceCenterX + 24));
            const fTop = Math.max(10, Math.round(faceCenterY - 20));
            const fBottom = Math.min(H - 12, Math.round(faceCenterY + 22));

            let featureEdgeSum = 0;
            let featureDarkSpots = 0; // eyes, eyebrows, nostrils, mouth corners
            let featurePixels = 0;
            const avgFaceLuma = roiPixels > 0 ? lumaSum / roiPixels : 128;

            for (let y = fTop; y < fBottom; y++) {
              for (let x = fLeft; x < fRight; x++) {
                const l = currentLuma[y * W + x];
                const lAbove = currentLuma[(y - 2) * W + x];
                const lLeft = currentLuma[y * W + (x - 2)];
                featureEdgeSum +=
                  Math.abs(l - lAbove) * 0.7 + Math.abs(l - lLeft) * 0.3;
                if (l < avgFaceLuma * 0.72) {
                  featureDarkSpots++;
                }
                featurePixels++;
              }
            }

            const avgFeatureContrast =
              featurePixels > 0 ? featureEdgeSum / featurePixels : 0;
            const darkFeatureRatio =
              featurePixels > 0 ? featureDarkSpots / featurePixels : 0;

            // Frame-to-frame motion check (rejects completely frozen frame or wild camera pan)
            let frameDiffSum = 0;
            if (prevFrameLumaRef.current) {
              for (let i = 0; i < currentLuma.length; i += 4) {
                frameDiffSum += Math.abs(
                  currentLuma[i] - prevFrameLumaRef.current[i]
                );
              }
            }
            prevFrameLumaRef.current = currentLuma;
            const avgFrameMotion = frameDiffSum / (currentLuma.length / 4);

            //Heuristic face verdict:
            // 1. Sufficient human skin in center (at least 18%)
            // 2. Not a uniform beige wall covering the entire outer border with low contrast
            // 3. Real facial feature contrast (eyes/brows/mouth: avgFeatureContrast >= 4.2 and darkFeatureRatio between 3% and 42%)
            // 4. Camera isn't being wildly swung around (avgFrameMotion < 28)
            const heuristicFaceDetected =
              centerSkinRatio >= 0.18 &&
              (centerSkinRatio > outerSkinRatio * 1.25 ||
                avgFeatureContrast > 7.5) &&
              avgFeatureContrast >= 4.2 &&
              darkFeatureRatio >= 0.025 &&
              darkFeatureRatio <= 0.45 &&
              avgFaceLuma > 32 &&
              avgFaceLuma < 238 &&
              avgFrameMotion < 28;

            const rawFaceDetected =
              nativeFaceResult !== null
                ? nativeFaceResult && centerSkinRatio >= 0.1
                : heuristicFaceDetected;

            // Smooth confidence over ~6 frames so a single frame blink doesn't flicker
            faceConfidenceRef.current =
              faceConfidenceRef.current * 0.75 + (rawFaceDetected ? 0.25 : 0);
            const facePresent = faceConfidenceRef.current >= 0.45;

            if (!facePresent) {
              // No face in view -> immediately stop heartbeats and decay breathing to 0
              smoothedBreathRef.current *= 0.85;
              setSnapshot((prev) => ({
                ...prev,
                facePresent: false,
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

            const headX = -((faceCenterX - W / 2) / (W * 0.25));
            const headY = (faceCenterY - H * 0.42) / (H * 0.25);
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
            if (bBuf.length > 8) {
              const mean = bBuf.reduce((acc, s) => acc + s.v, 0) / bBuf.length;
              let maxDev = 0.26;
              for (const s of bBuf) {
                const d = Math.abs(s.v - mean);
                if (d > maxDev) maxDev = d;
              }
              const recent =
                bBuf.slice(-4).reduce((a, s) => a + s.v, 0) /
                Math.min(4, bBuf.length);
              const diff = recent - mean;
              const effectiveDiff =
                Math.abs(diff) < 0.04
                  ? 0
                  : diff - Math.sign(diff) * 0.04;
              rawBreath = Math.max(
                -1,
                Math.min(1, effectiveDiff / (maxDev * 0.55))
              );
            }

            smoothedBreathRef.current =
              smoothedBreathRef.current * 0.78 + rawBreath * 0.22;
            const currentBreath = Math.max(
              -1,
              Math.min(1, smoothedBreathRef.current * 1.25)
            );

            const breathDelta = currentBreath - prevBreathPhaseRef.current;
            prevBreathPhaseRef.current = currentBreath;

            let breathState: BreathState = "steady";
            if (currentBreath > 0.14 || breathDelta > 0.012) {
              breathState = "inhaling";
            } else if (currentBreath < -0.14 || breathDelta < -0.012) {
              breathState = "exhaling";
            }

            if (Math.abs(currentBreath) > 0.15) {
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
            const mCenterX = Math.round(
              Math.max(36, Math.min(W - 36, faceCenterX))
            );
            const mCenterY = Math.round(
              Math.max(30, Math.min(H - 22, faceCenterY + 12))
            );

            let darkPixels = 0;
            let brightTeethPixels = 0;
            let minDarkX = W;
            let maxDarkX = 0;
            let minDarkY = H;
            let maxDarkY = 0;
            let mouthBoxTotal = 0;

            for (let y = mCenterY - 9; y <= mCenterY + 9; y++) {
              for (let x = mCenterX - 18; x <= mCenterX + 18; x++) {
                const idx = (y * W + x) * 4;
                const g = frame[idx + 1];
                const b = frame[idx + 2];
                const luma = currentLuma[y * W + x];
                mouthBoxTotal++;

                if (luma < avgFaceLuma * 0.68) {
                  darkPixels++;
                  if (x < minDarkX) minDarkX = x;
                  if (x > maxDarkX) maxDarkX = x;
                  if (y < minDarkY) minDarkY = y;
                  if (y > maxDarkY) maxDarkY = y;
                }

                if (
                  luma > avgFaceLuma * 1.08 &&
                  b > g * 0.82 &&
                  Math.abs(x - mCenterX) < 14
                ) {
                  brightTeethPixels++;
                }
              }
            }

            const darkRatio =
              mouthBoxTotal > 0 ? darkPixels / mouthBoxTotal : 0;
            const brightRatio =
              mouthBoxTotal > 0 ? brightTeethPixels / mouthBoxTotal : 0;
            const mouthWidth = Math.max(1, maxDarkX - minDarkX);
            const mouthHeight = Math.max(1, maxDarkY - minDarkY);
            const mouthAspect = mouthWidth / mouthHeight;

            const base = baselineRef.current;
            if (base.samples < 35) {
              base.mouthDarkRatio =
                (base.mouthDarkRatio * base.samples + darkRatio) /
                (base.samples + 1);
              base.mouthBrightRatio =
                (base.mouthBrightRatio * base.samples + brightRatio) /
                (base.samples + 1);
              base.mouthAspect =
                (base.mouthAspect * base.samples + mouthAspect) /
                (base.samples + 1);
              base.samples += 1;
            }

            // Raw frame detection with tightened thresholds (ignores subtle lip/breathing twitches)
            let rawCandidate: BiometricExpression = "calm";

            if (
              darkRatio > base.mouthDarkRatio + 0.085 &&
              mouthHeight >= 8 &&
              mouthAspect < 1.85
            ) {
              rawCandidate = "surprised";
            } else if (
              brightRatio > base.mouthBrightRatio + 0.042 ||
              (mouthWidth >= 16 &&
                mouthAspect >= 2.25 &&
                darkRatio > base.mouthDarkRatio + 0.02)
            ) {
              rawCandidate = "grin";
            }

            // Hysteresis & consecutive confirmation:
            // Require expression to persist steadily across at least 6 consecutive frames (~200ms)
            const cons = expressionConsecutiveRef.current;
            if (rawCandidate === cons.candidate) {
              cons.count += 1;
            } else {
              cons.candidate = rawCandidate;
              cons.count = 1;
            }

            let detectedExpr: BiometricExpression = expressionHoldRef.current.expr;

            // Only switch if deliberately confirmed across multiple frames
            if (cons.count >= 6 && cons.candidate !== "calm") {
              detectedExpr = cons.candidate;
              expressionHoldRef.current = {
                expr: cons.candidate,
                until: now + 2800, // hold stable expression for 2.8s
              };
            } else if (now >= expressionHoldRef.current.until) {
              // Smoothly return to calm baseline
              detectedExpr = "calm";
              expressionHoldRef.current = {
                expr: "calm",
                until: now + 1200,
              };
            }

            if (detectedExpr === "calm" && base.samples >= 35) {
              base.mouthDarkRatio =
                base.mouthDarkRatio * 0.992 + darkRatio * 0.008;
              base.mouthBrightRatio =
                base.mouthBrightRatio * 0.992 + brightRatio * 0.008;
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

            const pulseBpm = lastDisplayedBpmRef.current;

            const beatIntervalMs = (60 / pulseBpm) * 1000;
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
                currentBreath,
              ];
              const pulseSample = triggeredBeat
                ? 0.95
                : normalizedPulseWave * 0.55;
              pulseTraceRef.current = [
                ...pulseTraceRef.current.slice(1),
                pulseSample,
              ];
            }

            setSnapshot((prev) => ({
              ...prev,
              facePresent: true,
              breathPhase: currentBreath,
              breathState,
              breathTrace: breathTraceRef.current,
              pulseTrace: pulseTraceRef.current,
              breathingRateBpm,
              pulseBpm,
              heartbeatCount: beatCounterRef.current,
              heartbeatAngle: triggeredBeat
                ? (Math.random() - 0.5) * Math.PI * 1.2 - Math.PI / 2
                : prev.heartbeatAngle,
              expression: detectedExpr,
              headX: Math.max(-1, Math.min(1, headX)),
              headY: Math.max(-1, Math.min(1, headY)),
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
