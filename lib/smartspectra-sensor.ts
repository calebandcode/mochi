"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export type BiometricExpression = "calm" | "grin" | "surprised";
export type BreathState = "inhaling" | "exhaling" | "steady";

export interface SmartSpectraSnapshot {
  facePresent: boolean;
  breathPhase: number;
  breathState: BreathState;
  breathTrace: number[];
  pulseTrace: number[];
  breathingRateBpm: number;
  pulseBpm: number;
  heartbeatCount: number;
  heartbeatAngle: number;
  expression: BiometricExpression;
  headX: number;
  headY: number;
  sdkBridgeConnected: boolean;
  runtimeMode: "native-presage-sdk" | "serverless-fallback" | "connecting";
  validationHint: string;
  sdkError: string | null;
  hrvRmssd: number | null;
  sdkVersion: string;
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

export function useSmartSpectraCamera(enabled: boolean) {
  const [isReady, setIsReady] = useState(false);
  const [snapshot, setSnapshot] =
    useState<SmartSpectraSnapshot>(INITIAL_SNAPSHOT);

  const nativeActiveRef = useRef(false);
  const lastBeatTimeRef = useRef(0);
  const beatCounterRef = useRef(0);
  const prevBreathPhaseRef = useRef(0);
  const smoothedHeadXRef = useRef(0);
  const smoothedHeadYRef = useRef(0);
  const latestPulseBpmRef = useRef(0);
  const latestFacePresentRef = useRef(false);
  const lastLandmarkAtRef = useRef(0);
  const validationFaceOkRef = useRef(true);

  const stopCamera = useCallback(() => {
    nativeActiveRef.current = false;
    lastBeatTimeRef.current = 0;
    beatCounterRef.current = 0;
    prevBreathPhaseRef.current = 0;
    smoothedHeadXRef.current = 0;
    smoothedHeadYRef.current = 0;
    latestPulseBpmRef.current = 0;
    latestFacePresentRef.current = false;
    lastLandmarkAtRef.current = 0;
    validationFaceOkRef.current = true;
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
    const eventSource = new EventSource("/api/smartspectra/stream");

    eventSource.onmessage = (event) => {
      if (cancelled) return;
      try {
        const payload = JSON.parse(event.data);

        if (payload.type === "status") {
          const isNative = payload.runtimeMode === "native-presage-sdk";
          nativeActiveRef.current = isNative;
          if (isNative) {
            setIsReady(true);
          }
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
          validationFaceOkRef.current = faceOk;
          if (!faceOk) {
            latestFacePresentRef.current = false;
            latestPulseBpmRef.current = 0;
            smoothedHeadXRef.current = 0;
            smoothedHeadYRef.current = 0;
          }
          setSnapshot((prev) => ({
            ...prev,
            facePresent: faceOk && latestFacePresentRef.current,
            validationHint: payload.hint || "",
            ...(faceOk
              ? {}
              : {
                  facePresent: false,
                  pulseBpm: 0,
                  breathingRateBpm: 0,
                  breathPhase: 0,
                  breathState: "steady" as BreathState,
                  headX: 0,
                  headY: 0,
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

          const hasLandmarks = Boolean(payload.landmarkCenter);
          if (payload.landmarkCenter) {
            lastLandmarkAtRef.current = performance.now();
            const rawX = Number(payload.landmarkCenter.x);
            const rawY = Number(payload.landmarkCenter.y);
            const normX = rawX > 1.5 ? rawX / 640 : rawX;
            const normY = rawY > 1.5 ? rawY / 480 : rawY;
            const targetHeadX = Math.max(-1, Math.min(1, -(normX - 0.5) * 3.6));
            const targetHeadY = Math.max(-1, Math.min(1, (normY - 0.45) * 3.4));
            smoothedHeadXRef.current =
              smoothedHeadXRef.current * 0.5 + targetHeadX * 0.5;
            smoothedHeadYRef.current =
              smoothedHeadYRef.current * 0.5 + targetHeadY * 0.5;
          }

          const faceActiveNow =
            validationFaceOkRef.current &&
            (hasLandmarks ||
              (lastLandmarkAtRef.current > 0 &&
                performance.now() - lastLandmarkAtRef.current < 1200));

          const liveBpm =
            faceActiveNow &&
            typeof payload.pulseBpm === "number" &&
            payload.pulseBpm > 30
              ? payload.pulseBpm
              : null;
          if (liveBpm !== null) {
            latestPulseBpmRef.current = liveBpm;
          } else if (!faceActiveNow) {
            latestPulseBpmRef.current = 0;
          }
          latestFacePresentRef.current = faceActiveNow;

          setSnapshot((prev) => ({
            ...prev,
            facePresent: faceActiveNow,
            pulseBpm: !faceActiveNow
              ? 0
              : liveBpm !== null
                ? liveBpm
                : prev.pulseBpm,
            pulseTrace: !faceActiveNow
              ? Array(36).fill(0)
              : nextPulseTrace
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
            breathingRateBpm: !faceActiveNow
              ? 0
              : typeof payload.breathingRateBpm === "number" &&
                  payload.breathingRateBpm > 0
                ? payload.breathingRateBpm
                : prev.breathingRateBpm,
            breathPhase: !faceActiveNow
              ? 0
              : nextBreathPhase !== null
                ? nextBreathPhase
                : prev.breathPhase,
            breathState: !faceActiveNow
              ? "steady"
              : nextBreathState !== null
                ? nextBreathState
                : prev.breathState,
            breathTrace: !faceActiveNow
              ? Array(36).fill(0)
              : nextBreathTrace
                ? [
                    ...prev.breathTrace.slice(
                      Math.min(prev.breathTrace.length, nextBreathTrace.length)
                    ),
                    ...nextBreathTrace,
                  ].slice(-36)
                : prev.breathTrace,
            expression: !faceActiveNow
              ? "calm"
              : ((payload.expression as BiometricExpression | null) ??
                prev.expression),
            headX: faceActiveNow ? smoothedHeadXRef.current : 0,
            headY: faceActiveNow ? smoothedHeadYRef.current : 0,
          }));
        }
      } catch {}
    };

    const loop = () => {
      if (cancelled) return;
      const now = performance.now();

      if (
        latestFacePresentRef.current &&
        lastLandmarkAtRef.current > 0 &&
        now - lastLandmarkAtRef.current > 1200
      ) {
        latestFacePresentRef.current = false;
        latestPulseBpmRef.current = 0;
        smoothedHeadXRef.current = 0;
        smoothedHeadYRef.current = 0;
        setSnapshot((prev) => ({
          ...prev,
          facePresent: false,
          pulseBpm: 0,
          breathingRateBpm: 0,
          breathPhase: 0,
          breathState: "steady",
          pulseTrace: Array(36).fill(0),
          breathTrace: Array(36).fill(0),
          expression: "calm",
          headX: 0,
          headY: 0,
        }));
      }

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

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      eventSource.close();
      stopCamera();
    };
  }, [enabled, stopCamera]);

  return {
    isReady,
    snapshot,
    stopCamera,
  };
}
