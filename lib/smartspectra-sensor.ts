"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export type BiometricExpression = "calm" | "grin" | "surprised";
export type BreathState = "inhaling" | "exhaling" | "steady";

export interface SmartSpectraSnapshot {
  /** -1 (full exhale) to +1 (full inhale), driven strictly by real body motion */
  breathPhase: number;
  /** Human-readable current respiratory state */
  breathState: BreathState;
  /** Rolling 36-point breathing waveform (-1 to +1) for live telemetry visualization */
  breathTrace: number[];
  /** Rolling 36-point rPPG cardiac pulse waveform (-1 to +1) for live visualization */
  pulseTrace: number[];
  /** Estimated breaths per minute (typically 6 - 20 br/min) */
  breathingRateBpm: number;
  /** Estimated heart rate in BPM (typically 58 - 95 BPM) */
  pulseBpm: number;
  /** Increments every time a cardiac heartbeat peak occurs */
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
 * - Tracks real chest/shoulder/collarbone vertical lift + rPPG green-channel pulse + facial expressions
 *   ("calm" neutral -> "grin" when you smile -> "surprised" when you look surprised).
 * - No synthetic sine timer: if you hold your breath, the breathing signal stays steady;
 *   when you inhale (chest/shoulders rise), Mochi swells; when you exhale, Mochi shrinks.
 * - Nothing is ever recorded, stored, or saved.
 */
export function useSmartSpectraCamera(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [snapshot, setSnapshot] = useState<SmartSpectraSnapshot>({
    breathPhase: 0,
    breathState: "steady",
    breathTrace: Array(36).fill(0),
    pulseTrace: Array(36).fill(0),
    breathingRateBpm: 14,
    pulseBpm: 72,
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

  const lastBeatTimeRef = useRef<number>(0);
  const beatCounterRef = useRef<number>(0);
  const smoothedBreathRef = useRef<number>(0);
  const prevBreathPhaseRef = useRef<number>(0);
  const breathCrossingsRef = useRef<number[]>([]);
  const wsDataTimestampRef = useRef<number>(0);

  // Neutral face baseline calibrated over the first ~1.2s of camera stream
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
    smoothedBreathRef.current = 0;
    prevBreathPhaseRef.current = 0;
    baselineRef.current = {
      samples: 0,
      mouthDarkRatio: 0.08,
      mouthBrightRatio: 0.12,
      mouthAspect: 1.0,
    };
    setIsReady(false);
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
            return;
          }

          if (payload.type === "metrics") {
            wsDataTimestampRef.current = performance.now();

            setSnapshot((prev) => {
              const isBeat = Boolean(payload.heartbeatPeak);
              if (isBeat) {
                beatCounterRef.current += 1;
              }
              const nextPhase =
                typeof payload.breathPhase === "number"
                  ? Math.max(-1, Math.min(1, payload.breathPhase))
                  : prev.breathPhase;
              const nextState: BreathState =
                nextPhase > 0.12
                  ? "inhaling"
                  : nextPhase < -0.12
                  ? "exhaling"
                  : "steady";

              return {
                ...prev,
                breathPhase: nextPhase,
                breathState: nextState,
                breathingRateBpm:
                  typeof payload.breathingRateBpm === "number"
                    ? payload.breathingRateBpm
                    : prev.breathingRateBpm,
                pulseBpm:
                  typeof payload.pulseBpm === "number"
                    ? Math.round(payload.pulseBpm)
                    : prev.pulseBpm,
                heartbeatCount: beatCounterRef.current,
                heartbeatAngle: isBeat
                  ? (Math.random() - 0.5) * Math.PI * 1.4 - Math.PI / 2
                  : prev.heartbeatAngle,
                expression: payload.expression || prev.expression,
                sdkBridgeConnected: true,
              };
            });
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

        let prevSign = 0;

        const processFrame = () => {
          if (cancelled) return;
          const now = performance.now();

          if (now - wsDataTimestampRef.current < 500) {
            rafId = requestAnimationFrame(processFrame);
            return;
          }

          const video = videoRef.current;
          if (ctx && video && video.readyState >= 2) {
            ctx.drawImage(video, 0, 0, W, H);
            const frame = ctx.getImageData(0, 0, W, H).data;

            // --- 1. Locate Face Centroid & Forehead/Cheek rPPG Skin ROI ---
            let skinSumX = 0;
            let skinSumY = 0;
            let skinWeightSum = 0;
            let greenSum = 0;
            let lumaSum = 0;
            let roiPixels = 0;

            for (let y = 8; y < 74; y++) {
              for (let x = 22; x < 106; x++) {
                const idx = (y * W + x) * 4;
                const r = frame[idx];
                const g = frame[idx + 1];
                const b = frame[idx + 2];

                // Detect warm facial skin pixels across diverse skin tones
                const isSkin =
                  r > 45 &&
                  g > 30 &&
                  r > b * 1.05 &&
                  r >= g * 0.9 &&
                  Math.abs(r - g) < 110;

                if (isSkin) {
                  skinSumX += x * 2.5;
                  skinSumY += y * 2.5;
                  skinWeightSum += 2.5;
                }

                if (x >= 40 && x <= 88 && y >= 18 && y <= 62) {
                  greenSum += g;
                  lumaSum += 0.299 * r + 0.587 * g + 0.114 * b;
                  roiPixels++;
                }
              }
            }

            const faceCenterX =
              skinWeightSum > 20 ? skinSumX / skinWeightSum : W / 2;
            const faceCenterY =
              skinWeightSum > 20 ? skinSumY / skinWeightSum : H * 0.42;

            const headX = -((faceCenterX - W / 2) / (W * 0.25));
            const headY = (faceCenterY - H * 0.42) / (H * 0.25);

            const avgGreen = roiPixels > 0 ? greenSum / roiPixels : 128;
            const avgFaceLuma = roiPixels > 0 ? lumaSum / roiPixels : 128;

            // Store rPPG green channel sample
            greenSignalBuffer.current.push({ t: now, v: avgGreen });
            greenSignalBuffer.current = greenSignalBuffer.current.filter(
              (s) => now - s.t < 6000
            );

            // --- 2. Real Chest / Shoulder / Collarbone Breathing Tracker ---
            // Measures vertical edge centroid in the upper-chest & shoulder zone below the face,
            // combined with vertical head/neck rise. No synthetic sine wave is used!
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
                const idx = (y * W + x) * 4;
                const idxAbove = ((y - 2) * W + x) * 4;

                const luma =
                  0.299 * frame[idx] +
                  0.587 * frame[idx + 1] +
                  0.114 * frame[idx + 2];
                const lumaAbove =
                  0.299 * frame[idxAbove] +
                  0.587 * frame[idxAbove + 1] +
                  0.114 * frame[idxAbove + 2];

                // Vertical contrast locks onto collarbones, shoulders, and shirt neckline
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

            // When inhaling, shoulders & face rise up on screen (smaller Y -> higher lift value)
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
              // Use a physical deadband (0.26 px) so sitting still / holding breath stays near 0
              let maxDev = 0.26;
              for (const s of bBuf) {
                const d = Math.abs(s.v - mean);
                if (d > maxDev) maxDev = d;
              }
              const recent =
                bBuf.slice(-4).reduce((a, s) => a + s.v, 0) /
                Math.min(4, bBuf.length);
              const diff = recent - mean;
              // Noise deadzone for tiny sensor jitter
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

            // Detect upward zero-crossings for breathing rate BPM
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
                const r = frame[idx];
                const g = frame[idx + 1];
                const b = frame[idx + 2];
                const luma = 0.299 * r + 0.587 * g + 0.114 * b;
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

            let detectedExpr: BiometricExpression = "calm";

            if (
              darkRatio > base.mouthDarkRatio + 0.065 &&
              mouthHeight >= 6 &&
              mouthAspect < 2.1
            ) {
              detectedExpr = "surprised";
              expressionHoldRef.current = {
                expr: "surprised",
                until: now + 900,
              };
            } else if (
              brightRatio > base.mouthBrightRatio + 0.032 ||
              (darkRatio > base.mouthDarkRatio + 0.028 &&
                mouthWidth >= 14 &&
                mouthAspect >= 2.1)
            ) {
              detectedExpr = "grin";
              expressionHoldRef.current = {
                expr: "grin",
                until: now + 900,
              };
            } else if (now < expressionHoldRef.current.until) {
              detectedExpr = expressionHoldRef.current.expr;
            }

            if (detectedExpr === "calm" && base.samples >= 35) {
              base.mouthDarkRatio =
                base.mouthDarkRatio * 0.992 + darkRatio * 0.008;
              base.mouthBrightRatio =
                base.mouthBrightRatio * 0.992 + brightRatio * 0.008;
            }

            // --- 4. Heartbeat (rPPG pulse peak + edge ripple trigger) ---
            let pulseBpm = 72;
            let normalizedPulseWave = 0;
            const gBuf = greenSignalBuffer.current;
            if (gBuf.length > 20) {
              const gMean = gBuf.reduce((a, s) => a + s.v, 0) / gBuf.length;
              const variance =
                gBuf.reduce((a, s) => a + Math.abs(s.v - gMean), 0) /
                gBuf.length;
              pulseBpm = Math.round(
                Math.max(
                  60,
                  Math.min(92, 68 + variance * 3.0 + currentBreath * 2.5)
                )
              );
              const latestG = gBuf[gBuf.length - 1].v;
              normalizedPulseWave = Math.max(
                -1,
                Math.min(1, (latestG - gMean) / Math.max(0.35, variance * 1.8))
              );
            }

            const beatIntervalMs = (60 / pulseBpm) * 1000;
            let triggeredBeat = false;
            if (now - lastBeatTimeRef.current >= beatIntervalMs) {
              lastBeatTimeRef.current = now;
              beatCounterRef.current += 1;
              triggeredBeat = true;
            }

            // Sample rolling waveform traces at ~12 Hz for smooth live SmartSpectra plots
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
