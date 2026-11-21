"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export type BiometricExpression = "calm" | "grin" | "surprised";
export type BreathState = "inhaling" | "exhaling" | "steady";

export interface SmartSpectraSnapshot {
  /** True ONLY when the native Presage SmartSpectra SDK reports a valid face in view */
  facePresent: boolean;
  /** -1 (full exhale) to +1 (full inhale), driven strictly by Presage breathing.upperTrace */
  breathPhase: number;
  /** Human-readable current respiratory state derived from Presage breathing trace */
  breathState: BreathState;
  /** Rolling 36-point breathing waveform (-1 to +1) from Presage SDK */
  breathTrace: number[];
  /** Rolling 36-point cardiac arterial pressure waveform (-1 to +1) from Presage SDK */
  pulseTrace: number[];
  /** Live breathing rate in breaths/min from Presage breathing.rate (0 until locked) */
  breathingRateBpm: number;
  /** Live heart rate in BPM from Presage cardio.pulseRate (0 until locked) */
  pulseBpm: number;
  /** Increments ONLY when Presage SDK reports a face and a live pulse rate */
  heartbeatCount: number;
  /** Angle (radians) around Mochi where the latest heartbeat ripple originates */
  heartbeatAngle: number;
  /** Facial expression strictly from Presage face.expression */
  expression: BiometricExpression;
  /** Normalized head offset (-1 to +1) strictly from Presage face.landmarks */
  headX: number;
  headY: number;
  /** True ONLY when connected to the live native @smartspectra/node-sdk backend */
  sdkBridgeConnected: boolean;
  /** Active runtime mode reported by /api/smartspectra/stream */
  runtimeMode: "native-presage-sdk" | "serverless-fallback" | "connecting";
  /** Latest validation hint from Presage SDK (e.g. "No face found", "Too dark") */
  validationHint: string;
  /** Explicit SDK error or missing API key notice */
  sdkError: string | null;
  /** Latest HRV RMSSD (ms) from Presage cardio.hrv when available */
  hrvRmssd: number | null;
  /** Native @smartspectra/node-sdk version reported by backend */
  sdkVersion: string;
  /** Hardware camera name reported by @smartspectra/node-sdk */
  cameraName: string;
}

const INITIAL_SNAPSHOT: SmartSpectraSnapshot = {
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
  sdkError: null,
  hrvRmssd: null,
  sdkVersion: "3.5.0",
  cameraName: "Webcam",
};

/**
 * Pure Presage SmartSpectra SDK v3.5.0 React Hook (Zero Fallback / Zero Simulated Vitals).
 *
 * 1. Opens the user's webcam via `getUserMedia` (320x240) and streams raw RGBA frames
 *    in volatile memory to `POST /api/smartspectra/frame` -> `SmartSpectraSDK.sendFrame()`.
 * 2. Subscribes to `GET /api/smartspectra/stream` (SSE) to receive live decoded Presage
 *    protobuf metrics (`cardio`, `breathing`, `face`) and `validationStatus` events.
 * 3. If `SMARTSPECTRA_API_KEY` is missing or the native SDK is unavailable, no vitals
 *    are fabricated: BPM remains 0 (`--`), facePresent remains false, and `sdkError` is surfaced.
 */
export function useSmartSpectraCamera(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SmartSpectraSnapshot>(INITIAL_SNAPSHOT);

  const nativeActiveRef = useRef(false);
  const lastBeatTimeRef = useRef(0);
  const beatCounterRef = useRef(0);
  const prevBreathPhaseRef = useRef(0);
  const smoothedHeadXRef = useRef(0);
  const smoothedHeadYRef = useRef(0);
  const latestPulseBpmRef = useRef(0);
  const latestFacePresentRef = useRef(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    nativeActiveRef.current = false;
    lastBeatTimeRef.current = 0;
    beatCounterRef.current = 0;
    prevBreathPhaseRef.current = 0;
    smoothedHeadXRef.current = 0;
    smoothedHeadYRef.current = 0;
    latestPulseBpmRef.current = 0;
    latestFacePresentRef.current = false;
    setIsReady(false);
    setSnapshot(INITIAL_SNAPSHOT);
  }, []);

  useEffect(() => {
    if (!enabled) {
      stopCamera();
      return;
    }

    let cancelled = false;
    let rafId = 0;
    let eventSource: EventSource | null = null;

    // 1. Subscribe to live Presage SmartSpectra SDK SSE stream
    eventSource = new EventSource("/api/smartspectra/stream");
    eventSource.onmessage = (event) => {
      if (cancelled) return;
      try {
        const payload = JSON.parse(event.data);

        if (payload.type === "status") {
          const isNative = payload.runtimeMode === "native-presage-sdk";
          nativeActiveRef.current = isNative;
          setSnapshot((prev) => ({
            ...prev,
            sdkBridgeConnected: isNative,
            runtimeMode: payload.runtimeMode || "serverless-fallback",
            sdkError: isNative
              ? null
              : payload.error ||
                "SMARTSPECTRA_API_KEY is not configured or native SDK is unavailable.",
            sdkVersion: payload.sdkVersion || prev.sdkVersion,
            cameraName:
              Array.isArray(payload.cameras) && payload.cameras[0]?.name
                ? payload.cameras[0].name
                : prev.cameraName,
            ...(isNative
              ? {}
              : {
                  facePresent: false,
                  pulseBpm: 0,
                  breathingRateBpm: 0,
                  breathPhase: 0,
                  breathState: "steady" as BreathState,
                }),
          }));
        } else if (payload.type === "validation") {
          const faceOk = Boolean(payload.facePresent);
          latestFacePresentRef.current = faceOk;
          if (!faceOk) {
            latestPulseBpmRef.current = 0;
          }
          setSnapshot((prev) => ({
            ...prev,
            facePresent: faceOk,
            validationHint: payload.hint || "",
            ...(faceOk
              ? {}
              : {
                  pulseBpm: 0,
                  breathingRateBpm: 0,
                  breathPhase: 0,
                  breathState: "steady" as BreathState,
                }),
          }));
        } else if (payload.type === "sdk_error") {
          nativeActiveRef.current = false;
          latestFacePresentRef.current = false;
          latestPulseBpmRef.current = 0;
          setSnapshot((prev) => ({
            ...prev,
            sdkBridgeConnected: false,
            facePresent: false,
            pulseBpm: 0,
            breathingRateBpm: 0,
            sdkError: payload.message || `Presage SDK error (${payload.code})`,
          }));
        } else if (payload.type === "metrics") {
          if (!nativeActiveRef.current) return;

          // Normalize pulse waveform
          let nextPulseTrace: number[] | null = null;
          if (Array.isArray(payload.pulseTrace) && payload.pulseTrace.length > 0) {
            const pts = payload.pulseTrace as number[];
            const mean = pts.reduce((a, b) => a + b, 0) / pts.length;
            const maxAbs = Math.max(
              0.001,
              ...pts.map((v) => Math.abs(v - mean))
            );
            nextPulseTrace = pts.map((v) =>
              Math.max(-1, Math.min(1, (v - mean) / maxAbs))
            );
          }

          // Normalize breathing waveform & derive phase/state
          let nextBreathPhase: number | null = null;
          let nextBreathTrace: number[] | null = null;
          let nextBreathState: BreathState | null = null;
          if (
            Array.isArray(payload.breathingTrace) &&
            payload.breathingTrace.length > 0
          ) {
            const bt = payload.breathingTrace as number[];
            const bMean = bt.reduce((a, b) => a + b, 0) / bt.length;
            const bMax = Math.max(0.001, ...bt.map((v) => Math.abs(v - bMean)));
            nextBreathTrace = bt.map((v) =>
              Math.max(-1, Math.min(1, (v - bMean) / bMax))
            );
            nextBreathPhase = nextBreathTrace[nextBreathTrace.length - 1];
            const delta = nextBreathPhase - prevBreathPhaseRef.current;
            prevBreathPhaseRef.current = nextBreathPhase;
            if (nextBreathPhase > 0.14 || delta > 0.02) {
              nextBreathState = "inhaling";
            } else if (nextBreathPhase < -0.14 || delta < -0.02) {
              nextBreathState = "exhaling";
            } else {
              nextBreathState = "steady";
            }
          }

          // Derive headX / headY strictly from Presage face.landmarks
          if (payload.landmarkCenter) {
            const rawX = Number(payload.landmarkCenter.x);
            const rawY = Number(payload.landmarkCenter.y);
            // Support either normalized [0..1] or pixel [0..320, 0..240] coordinates
            const normX = rawX > 1.5 ? rawX / 320 : rawX;
            const normY = rawY > 1.5 ? rawY / 240 : rawY;
            const targetHeadX = Math.max(-1, Math.min(1, -(normX - 0.5) * 3.2));
            const targetHeadY = Math.max(-1, Math.min(1, (normY - 0.45) * 3.0));
            smoothedHeadXRef.current =
              smoothedHeadXRef.current * 0.6 + targetHeadX * 0.4;
            smoothedHeadYRef.current =
              smoothedHeadYRef.current * 0.6 + targetHeadY * 0.4;
          }

          const liveBpm =
            typeof payload.pulseBpm === "number" && payload.pulseBpm > 30
              ? payload.pulseBpm
              : null;
          if (liveBpm !== null) {
            latestPulseBpmRef.current = liveBpm;
          }
          latestFacePresentRef.current = true;

          setSnapshot((prev) => ({
            ...prev,
            facePresent: true,
            pulseBpm: liveBpm !== null ? liveBpm : prev.pulseBpm,
            pulseTrace: nextPulseTrace
              ? [
                  ...prev.pulseTrace.slice(
                    Math.min(prev.pulseTrace.length, nextPulseTrace.length)
                  ),
                  ...nextPulseTrace,
                ].slice(-36)
              : prev.pulseTrace,
            hrvRmssd:
              typeof payload.hrvRmssd === "number"
                ? Math.round(payload.hrvRmssd)
                : prev.hrvRmssd,
            breathingRateBpm:
              typeof payload.breathingRateBpm === "number" &&
              payload.breathingRateBpm > 0
                ? payload.breathingRateBpm
                : prev.breathingRateBpm,
            breathPhase:
              nextBreathPhase !== null ? nextBreathPhase : prev.breathPhase,
            breathState:
              nextBreathState !== null ? nextBreathState : prev.breathState,
            breathTrace: nextBreathTrace
              ? [
                  ...prev.breathTrace.slice(
                    Math.min(prev.breathTrace.length, nextBreathTrace.length)
                  ),
                  ...nextBreathTrace,
                ].slice(-36)
              : prev.breathTrace,
            expression:
              (payload.expression as BiometricExpression | null) ??
              prev.expression,
            headX: smoothedHeadXRef.current,
            headY: smoothedHeadYRef.current,
          }));
        }
      } catch {
        // Ignore malformed SSE packet
      }
    };

    // 2. Capture webcam and stream live 320x240 RGBA frames to SmartSpectraSDK.sendFrame()
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

        const SDK_W = 320;
        const SDK_H = 240;
        const sdkCanvas = document.createElement("canvas");
        sdkCanvas.width = SDK_W;
        sdkCanvas.height = SDK_H;
        const sdkCtx = sdkCanvas.getContext("2d", { willReadFrequently: true });

        let lastPushMs = 0;
        let pushInFlight = false;
        let lastTsUs = 0;

        const loop = () => {
          if (cancelled) return;
          const now = performance.now();
          const video = videoRef.current;

          if (
            nativeActiveRef.current &&
            sdkCtx &&
            video &&
            video.readyState >= 2 &&
            !pushInFlight &&
            now - lastPushMs >= 50
          ) {
            lastPushMs = now;
            pushInFlight = true;
            sdkCtx.drawImage(video, 0, 0, SDK_W, SDK_H);
            const rgbaBytes = sdkCtx.getImageData(0, 0, SDK_W, SDK_H).data;
            const tsUs = Math.max(lastTsUs + 33333, Math.round(now * 1000));
            lastTsUs = tsUs;

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
                pushInFlight = false;
              });
          }

          // Trigger heartbeat ripple ONLY when live Presage SDK has locked onto a real pulseBpm
          const liveBpm = latestPulseBpmRef.current;
          if (
            nativeActiveRef.current &&
            latestFacePresentRef.current &&
            liveBpm > 30
          ) {
            const beatIntervalMs = (60 / liveBpm) * 1000;
            if (now - lastBeatTimeRef.current >= beatIntervalMs) {
              lastBeatTimeRef.current = now;
              beatCounterRef.current += 1;
              setSnapshot((prev) => ({
                ...prev,
                heartbeatCount: beatCounterRef.current,
                heartbeatAngle:
                  (Math.random() - 0.5) * Math.PI * 1.2 - Math.PI / 2,
              }));
            }
          }

          rafId = requestAnimationFrame(loop);
        };

        rafId = requestAnimationFrame(loop);
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
