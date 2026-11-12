"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence, useSpring } from "framer-motion";
import { AFFIRMATIONS, Affirmation } from "@/lib/affirmations-data";

export type CharacterMood =
  | "dormant"
  | "calm"
  | "grin"
  | "curious"
  | "smug"
  | "surprised"
  | "sleepy"
  | "dizzy"
  | "love"
  | "poked";

export interface BreatheCoachMessage {
  badge?: string;
  lines: string[];
  hint?: string;
}

export interface ReactiveCharacterProps {
  mood?: CharacterMood;
  onMoodChange?: (mood: CharacterMood) => void;
  interactive?: boolean;
  colorTheme?: "monochrome" | "bubblegum" | "matcha" | "sunset" | "cyberpunk";
  soundEnabled?: boolean;
  size?: number;
  className?: string;
  waveIntensity?: number;
  waveSpeed?: number;
  waveSurgeEnabled?: boolean;
  viewMode?: "face" | "affirmation";
  onViewModeChange?: (mode: "face" | "affirmation") => void;
  affirmationIndex?: number;
  onAffirmationChange?: (index: number) => void;
  // ─── SmartSpectra Biometric & Co-Regulation Props ─────────────────────────
  cameraActive?: boolean;
  /** 0 (lifeless) to 1 (blood-flow streams meet at bottom & Mochi wakes up) */
  awakeningProgress?: number;
  /** Live breathing phase (-1 exhale to +1 inhale) */
  breathPhase?: number;
  /** Increments on each detected heartbeat peak */
  heartbeatCount?: number;
  /** Angle where the heartbeat ripple starts */
  heartbeatAngle?: number;
  /** Camera head pose (-1 to +1) */
  cameraHeadX?: number;
  cameraHeadY?: number;
  /** True when "Breathe with me" paced breathing mode is active */
  breatheWithMeActive?: boolean;
  /** 0 (starting) to 1 (fully calm & synced -> triggers reward card) */
  calmProgress?: number;
  /** Dynamic coaching message displayed when morphing into a card during breathing */
  breatheCoachMessage?: BreatheCoachMessage | null;
}

// ─── Playful Web Audio Sound Synthesizer ──────────────────────────────────────
class SoundFX {
  private ctx: AudioContext | null = null;

  private init() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  playPop() {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;

      osc.type = "sine";
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(780, now + 0.09);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.09);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.09);
    } catch { }
  }

  playChime() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const freqs = [523.25, 659.25, 783.99, 1046.5];
      freqs.forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const startTime = now + idx * 0.045;

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.14, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.45);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.45);
      });
    } catch { }
  }

  playMorph() {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;

      osc.type = "triangle";
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(580, now + 0.14);
      osc.frequency.exponentialRampToValueAtTime(420, now + 0.26);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.26);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.26);
    } catch { }
  }

  playDizzy() {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;

      osc.type = "sine";
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.linearRampToValueAtTime(460, now + 0.1);
      osc.frequency.linearRampToValueAtTime(240, now + 0.2);
      osc.frequency.linearRampToValueAtTime(520, now + 0.3);
      osc.frequency.linearRampToValueAtTime(260, now + 0.45);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.45);
    } catch { }
  }

  playPurr() {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;

      osc.type = "triangle";
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.linearRampToValueAtTime(220, now + 0.06);
      osc.frequency.linearRampToValueAtTime(190, now + 0.12);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.14);
    } catch { }
  }

  playBoing() {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;

      osc.type = "sine";
      osc.frequency.setValueAtTime(480, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.22);

      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.22);
    } catch { }
  }

  playHeartbeat() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      // Soft lub-dub pulse sound
      [0, 0.14].forEach((offset, i) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const t = now + offset;
        osc.type = "sine";
        osc.frequency.setValueAtTime(i === 0 ? 95 : 82, t);
        osc.frequency.exponentialRampToValueAtTime(42, t + 0.11);
        gain.gain.setValueAtTime(i === 0 ? 0.18 : 0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.005, t + 0.12);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.12);
      });
    } catch { }
  }
}

export const sfx = new SoundFX();

// ─── Mathematical Moving Wavy Border Generator ──────────────────────────────
interface WaveParams {
  time: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  pointsCount?: number;
  baseAmplitude?: number;
  speedMultiplier?: number;
  surgeMultiplier?: number;
  pokeRipple?: {
    angle: number;
    progress: number;
    strength: number;
  } | null;
  heartbeatRipple?: {
    angle: number;
    progress: number;
    strength: number;
  } | null;
  breathDisplacement?: number;
  dragOffset?: { x: number; y: number };
  mood: CharacterMood;
  isPetting: boolean;
  isAffirmation: boolean;
}

function generateWavySquirclePath({
  time,
  width,
  height,
  centerX,
  centerY,
  pointsCount = 56,
  baseAmplitude = 7.5,
  speedMultiplier = 1.0,
  surgeMultiplier = 1.0,
  pokeRipple = null,
  heartbeatRipple = null,
  breathDisplacement = 0,
  dragOffset = { x: 0, y: 0 },
  mood,
  isPetting,
  isAffirmation,
}: WaveParams): string {
  const points: [number, number][] = [];
  const a = width / 2 + breathDisplacement;
  const b = height / 2 + breathDisplacement * 0.88;
  const p = isAffirmation ? 4.0 : 4.2;

  const t = time * speedMultiplier;

  let moodSpeed = isAffirmation ? 0.85 : 1.0;
  let moodAmp = isAffirmation ? 1.05 : 1.0;
  let waveK1 = 5;
  let waveK2 = 8;

  if (!isAffirmation) {
    if (mood === "dizzy") {
      moodSpeed = 2.8;
      moodAmp = 2.2;
      waveK1 = 4;
      waveK2 = 7;
    } else if (mood === "dormant") {
      moodSpeed = 0.35;
      moodAmp = 0.52;
    } else if (mood === "sleepy") {
      moodSpeed = 0.45;
      moodAmp = 0.6;
    } else if (mood === "surprised" || mood === "poked") {
      moodSpeed = 1.9;
      moodAmp = 1.5;
      waveK1 = 7;
    } else if (mood === "love" || mood === "smug") {
      moodSpeed = 1.25;
      moodAmp = 1.2;
    }
  }

  const effectiveAmp = baseAmplitude * surgeMultiplier * moodAmp;

  const dragDist = Math.hypot(dragOffset.x, dragOffset.y);
  const dragAngle = Math.atan2(dragOffset.y, dragOffset.x);

  for (let i = 0; i < pointsCount; i++) {
    // Start at -Math.PI / 2 (top center) so blood-flow border streams split left & right from the top
    const theta = (i / pointsCount) * Math.PI * 2 - Math.PI / 2;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    const denom = Math.pow(
      Math.pow(Math.abs(cosT) / a, p) + Math.pow(Math.abs(sinT) / b, p),
      1 / p
    );
    const r0 = 1 / denom;

    const wave1 = Math.sin(waveK1 * theta - 2.6 * moodSpeed * t);
    const wave2 = Math.cos(waveK2 * theta + 3.8 * moodSpeed * t + 1.2) * 0.45;
    const wave3 = Math.sin(3 * theta - 1.4 * moodSpeed * t + 0.6) * 0.35;

    let displacement = (wave1 + wave2 + wave3) * effectiveAmp;

    // Petting / Co-regulation purr ripple
    if (isPetting) {
      displacement += Math.sin(16 * theta - 28 * t) * 4.2;
    }

    // Dizzy rolling vortex ripples
    if (mood === "dizzy" && !isAffirmation) {
      displacement += Math.sin(3 * theta - 9 * t) * 14;
    }

    // Elastic Drag Stretch Deformation
    if (dragDist > 5) {
      const angleDelta = Math.cos(theta - dragAngle);
      displacement += angleDelta * (dragDist * 0.28);
    }

    // Poke shockwave ripple
    if (pokeRipple && pokeRipple.strength > 0.01) {
      const angleDiff = Math.atan2(
        Math.sin(theta - pokeRipple.angle),
        Math.cos(theta - pokeRipple.angle)
      );
      const dist = Math.abs(angleDiff);
      const ripplePhase = dist * 12 - pokeRipple.progress * 26;
      const spatialEnvelope = Math.exp(-dist * 1.1);
      const timeEnvelope = (1 - pokeRipple.progress) * pokeRipple.strength;
      displacement +=
        Math.sin(ripplePhase) * 22 * spatialEnvelope * timeEnvelope;
    }

    // Heartbeat pulse ripple around Mochi's edge (travels symmetrically from top to bottom)
    if (heartbeatRipple && heartbeatRipple.strength > 0.01) {
      const angleDiff = Math.atan2(
        Math.sin(theta - heartbeatRipple.angle),
        Math.cos(theta - heartbeatRipple.angle)
      );
      const dist = Math.abs(angleDiff);
      const waveFront = dist - heartbeatRipple.progress * Math.PI * 1.15;
      const pulsePacket =
        Math.exp(-waveFront * waveFront * 6.0) *
        Math.cos(waveFront * 4.5);
      const fade = (1 - heartbeatRipple.progress * 0.75) * heartbeatRipple.strength;
      displacement += pulsePacket * 22.0 * fade;
    }

    const totalR = Math.max(20, r0 + displacement);
    const x = centerX + totalR * cosT;
    const y = centerY + totalR * sinT;
    points.push([x, y]);
  }

  // Smooth closed Cubic Bezier spline
  const n = points.length;
  let d = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;

  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];

    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;

    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }

  d += " Z";
  return d;
}

export function ReactiveCharacter({
  mood: controlledMood,
  onMoodChange,
  interactive = true,
  colorTheme = "monochrome",
  soundEnabled = false,
  className = "",
  waveIntensity = 1.1,
  waveSpeed = 1.0,
  waveSurgeEnabled = true,
  viewMode: controlledViewMode,
  onViewModeChange,
  affirmationIndex: controlledAffirmationIndex,
  cameraActive = false,
  awakeningProgress = 1,
  breathPhase = 0,
  heartbeatCount = 0,
  heartbeatAngle = -Math.PI / 2,
  cameraHeadX = 0,
  cameraHeadY = 0,
  breatheWithMeActive = false,
  calmProgress = 0,
  breatheCoachMessage = null,
}: ReactiveCharacterProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bodyPathRef = useRef<SVGPathElement>(null);
  const bloodPathRef = useRef<SVGPathElement>(null);
  const innerPathRef = useRef<SVGPathElement>(null);

  const [internalViewMode, setInternalViewMode] = useState<"face" | "affirmation">(
    controlledViewMode || "face"
  );
  const currentViewMode = controlledViewMode || internalViewMode;
  const isCardMode = currentViewMode === "affirmation";
  const showCoachCard = breatheWithMeActive && Boolean(breatheCoachMessage) && !isCardMode;

  const [internalAffirmationIndex] = useState(
    controlledAffirmationIndex || 0
  );
  const currentAffirmationIndex =
    controlledAffirmationIndex !== undefined
      ? controlledAffirmationIndex
      : internalAffirmationIndex;
  const currentAffirmation: Affirmation =
    AFFIRMATIONS[currentAffirmationIndex % AFFIRMATIONS.length];

  const [internalMood, setInternalMood] = useState<CharacterMood>(
    controlledMood || "grin"
  );
  const currentMood = controlledMood || internalMood;

  const [isBlinking, setIsBlinking] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [isPetting, setIsPetting] = useState(false);
  const [, setPetCount] = useState(0);

  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragDistanceRef = useRef(0);

  const mouseX = useSpring(0, { stiffness: 220, damping: 20 });
  const mouseY = useSpring(0, { stiffness: 220, damping: 20 });
  const headTilt = useSpring(0, { stiffness: 180, damping: 18 });

  const shakeHistory = useRef<{ x: number; time: number; dir: number }[]>([]);
  const lastMousePos = useRef({ x: 0, y: 0, time: 0 });
  const isDizzyRef = useRef(false);
  const idleTimer = useRef<NodeJS.Timeout | null>(null);

  // Poke shockwave state
  const pokeRippleRef = useRef<{
    angle: number;
    startTime: number;
    duration: number;
    strength: number;
  } | null>(null);

  // Heartbeat edge ripple state
  const heartbeatRippleRef = useRef<{
    angle: number;
    startTime: number;
    duration: number;
    strength: number;
  } | null>(null);

  // Smoothed breathing displacement ref for 60fps loop
  const targetBreathRef = useRef(0);
  const currentBreathDispRef = useRef(0);
  const [isHeartbeatPulse, setIsHeartbeatPulse] = useState(false);

  useEffect(() => {
    targetBreathRef.current = breathPhase;
  }, [breathPhase]);

  // Trigger a visible edge ripple + subtle pulse thump every time a heartbeat arrives
  useEffect(() => {
    if ((!cameraActive && !breatheWithMeActive) || heartbeatCount === 0) return;
    heartbeatRippleRef.current = {
      angle: heartbeatAngle,
      startTime: performance.now(),
      duration: 680,
      strength: breatheWithMeActive ? 0.95 : 1.35,
    };
    setIsHeartbeatPulse(true);
    const t = setTimeout(() => setIsHeartbeatPulse(false), 160);
    return () => clearTimeout(t);
  }, [heartbeatCount, heartbeatAngle, cameraActive, breatheWithMeActive]);

  // Camera head pose softly drives Mochi's gaze when camera is on
  useEffect(() => {
    if (!cameraActive || isCardMode) return;
    mouseX.set(cameraHeadX * 14);
    mouseY.set(cameraHeadY * 10);
    headTilt.set(cameraHeadX * 5);
  }, [cameraActive, cameraHeadX, cameraHeadY, isCardMode, mouseX, mouseY, headTilt]);

  // Purr sound during deep calm in "Breathe with me"
  const isCoRegulatingPurr = breatheWithMeActive && calmProgress >= 0.55;
  useEffect(() => {
    if (!isCoRegulatingPurr || !soundEnabled || isCardMode) return;
    const interval = setInterval(() => {
      sfx.playPurr();
    }, 2600);
    return () => clearInterval(interval);
  }, [isCoRegulatingPurr, soundEnabled, isCardMode]);

  const setViewMode = useCallback(
    (mode: "face" | "affirmation") => {
      setInternalViewMode(mode);
      onViewModeChange?.(mode);
    },
    [onViewModeChange]
  );

  const setMood = useCallback(
    (m: CharacterMood) => {
      setInternalMood(m);
      onMoodChange?.(m);
    },
    [onMoodChange]
  );

  // ─── Real-Time 60fps Moving Wavy Border Animation Loop ────────────────────
  useEffect(() => {
    let animId: number;
    const startTime = performance.now();

    const renderLoop = () => {
      const now = performance.now();
      const elapsed = (now - startTime) / 1000;

      // Smoothly interpolate breath displacement (swells on inhale, shrinks on exhale)
      const desiredDisp =
        (cameraActive || breatheWithMeActive) && !isCardMode
          ? targetBreathRef.current * (breatheWithMeActive ? 30 : 26)
          : 0;
      currentBreathDispRef.current +=
        (desiredDisp - currentBreathDispRef.current) * 0.12;

      let surge = 1.0;
      if (waveSurgeEnabled && !breatheWithMeActive) {
        const swellPeriod = isCardMode ? 9.0 : 7.5;
        const cyclePos = (elapsed % swellPeriod) / swellPeriod;
        const waveBurst = Math.pow(
          Math.sin(cyclePos * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5,
          3.5
        );
        surge = 1.0 + waveBurst * 1.35;
      }

      // As user calms down in "Breathe with me", Mochi's waves smooth out
      const calmSmoothing = breatheWithMeActive
        ? Math.max(0.45, 1.0 - calmProgress * 0.55)
        : 1.0;

      let pokeRipple: WaveParams["pokeRipple"] = null;
      if (pokeRippleRef.current) {
        const rippleElapsed = (now - pokeRippleRef.current.startTime) / 1000;
        const totalDuration = pokeRippleRef.current.duration / 1000;
        if (rippleElapsed < totalDuration) {
          pokeRipple = {
            angle: pokeRippleRef.current.angle,
            progress: rippleElapsed / totalDuration,
            strength: pokeRippleRef.current.strength,
          };
        } else {
          pokeRippleRef.current = null;
        }
      }

      let heartbeatRipple: WaveParams["heartbeatRipple"] = null;
      if (heartbeatRippleRef.current) {
        const hbElapsed = (now - heartbeatRippleRef.current.startTime) / 1000;
        const hbDuration = heartbeatRippleRef.current.duration / 1000;
        if (hbElapsed < hbDuration) {
          heartbeatRipple = {
            angle: heartbeatRippleRef.current.angle,
            progress: hbElapsed / hbDuration,
            strength: heartbeatRippleRef.current.strength,
          };
        } else {
          heartbeatRippleRef.current = null;
        }
      }

      const effectivePetting = isPetting || isCoRegulatingPurr;

      const outerPathData = generateWavySquirclePath({
        time: elapsed,
        width: isCardMode ? 336 : 324,
        height: isCardMode ? 288 : 278,
        centerX: 200,
        centerY: 172,
        pointsCount: 56,
        baseAmplitude: 7.2 * waveIntensity * calmSmoothing,
        speedMultiplier: waveSpeed * (breatheWithMeActive ? 0.72 : 1.0),
        surgeMultiplier: surge,
        pokeRipple,
        heartbeatRipple,
        breathDisplacement: currentBreathDispRef.current,
        dragOffset,
        mood: currentMood,
        isPetting: effectivePetting,
        isAffirmation: isCardMode,
      });

      const innerPathData = generateWavySquirclePath({
        time: elapsed + 0.15,
        width: isCardMode ? 316 : 304,
        height: isCardMode ? 268 : 260,
        centerX: 200,
        centerY: 172,
        pointsCount: 48,
        baseAmplitude: 4.8 * waveIntensity * calmSmoothing,
        speedMultiplier: waveSpeed * 0.95 * (breatheWithMeActive ? 0.72 : 1.0),
        surgeMultiplier: surge * 0.85,
        pokeRipple,
        heartbeatRipple,
        breathDisplacement: currentBreathDispRef.current * 0.94,
        dragOffset,
        mood: currentMood,
        isPetting: effectivePetting,
        isAffirmation: isCardMode,
      });

      if (bodyPathRef.current) {
        bodyPathRef.current.setAttribute("d", outerPathData);
      }
      if (bloodPathRef.current) {
        bloodPathRef.current.setAttribute("d", outerPathData);
      }
      if (innerPathRef.current) {
        innerPathRef.current.setAttribute("d", innerPathData);
      }

      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, [
    waveIntensity,
    waveSpeed,
    waveSurgeEnabled,
    currentMood,
    isPetting,
    isCoRegulatingPurr,
    isCardMode,
    dragOffset,
    cameraActive,
    breatheWithMeActive,
    calmProgress,
  ]);

  // Procedural blinking (face mode only)
  useEffect(() => {
    if (isCardMode) return;
    const blinkInterval = setInterval(() => {
      if (
        Math.random() > 0.25 &&
        currentMood !== "sleepy" &&
        currentMood !== "smug" &&
        currentMood !== "dizzy"
      ) {
        setIsBlinking(true);
        setTimeout(() => setIsBlinking(false), 140);
      }
    }, 3800);
    return () => clearInterval(blinkInterval);
  }, [currentMood, isCardMode]);

  // Global mouse tracking & rapid Left-Right Shake detection
  useEffect(() => {
    if (!interactive) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const dx = (e.clientX - centerX) / (window.innerWidth / 2);
      const dy = (e.clientY - centerY) / (window.innerHeight / 2);

      const targetX = Math.max(-1, Math.min(1, dx)) * (isCardMode ? 10 : 22);
      const targetY = Math.max(-1, Math.min(1, dy)) * (isCardMode ? 8 : 16);
      const targetTilt = Math.max(-1, Math.min(1, dx)) * (isCardMode ? 4 : 8);

      mouseX.set(targetX);
      mouseY.set(targetY);
      headTilt.set(targetTilt);

      // Rapid Left-Right Shake Detector
      const now = performance.now();
      const dt = now - lastMousePos.current.time;
      const moveX = e.clientX - lastMousePos.current.x;

      if (dt > 15 && Math.abs(moveX) > 8 && !isCardMode && !breatheWithMeActive) {
        const dir = moveX > 0 ? 1 : -1;
        const history = shakeHistory.current;
        const lastRecord = history[history.length - 1];

        if (!lastRecord || lastRecord.dir !== dir) {
          history.push({ x: e.clientX, time: now, dir });
        }

        shakeHistory.current = history.filter((h) => now - h.time < 850);

        if (shakeHistory.current.length >= 4 && !isDizzyRef.current) {
          isDizzyRef.current = true;
          setMood("dizzy");
          if (soundEnabled) sfx.playDizzy();

          pokeRippleRef.current = {
            angle: 0,
            startTime: performance.now(),
            duration: 1600,
            strength: 1.8,
          };

          setTimeout(() => {
            isDizzyRef.current = false;
            shakeHistory.current = [];
            if (!controlledMood) {
              setMood("grin");
            }
          }, 3400);
        }
      }

      lastMousePos.current = { x: e.clientX, y: e.clientY, time: now };

      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (!controlledMood && currentMood === "sleepy" && !isCardMode) {
        setMood("grin");
      }
      idleTimer.current = setTimeout(() => {
        if (
          !controlledMood &&
          currentMood === "grin" &&
          !isCardMode &&
          !isDizzyRef.current &&
          !cameraActive
        ) {
          setMood("sleepy");
        }
      }, 12000);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [
    interactive,
    mouseX,
    mouseY,
    headTilt,
    controlledMood,
    currentMood,
    setMood,
    soundEnabled,
    isCardMode,
    cameraActive,
    breatheWithMeActive,
  ]);

  const handlePoke = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive) return;

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const clickX = e.clientX - (rect.left + rect.width / 2);
      const clickY = e.clientY - (rect.top + rect.height / 2);
      const hitAngle = Math.atan2(clickY, clickX);

      pokeRippleRef.current = {
        angle: hitAngle,
        startTime: performance.now(),
        duration: 950,
        strength: 1.2,
      };
    }

    setIsPressed(true);
    if (soundEnabled) sfx.playPop();

    const playfulMoods: CharacterMood[] = [
      "grin",
      "curious",
      "smug",
      "surprised",
      "love",
    ];
    const otherMoods = playfulMoods.filter((m) => m !== currentMood);
    const nextRandomMood =
      otherMoods[Math.floor(Math.random() * otherMoods.length)];

    setMood("poked");
    setTimeout(() => {
      setIsPressed(false);
      setMood(controlledMood ? "grin" : nextRandomMood);
    }, 450);
  };

  const petCountRef = useRef(0);

  const handlePetMove = () => {
    if (!interactive || isCardMode || isDizzyRef.current) return;
    petCountRef.current += 1;
    setPetCount(petCountRef.current);
    if (petCountRef.current > 12 && currentMood !== "smug" && currentMood !== "love") {
      petCountRef.current = 0;
      setIsPetting(true);
      if (soundEnabled) sfx.playPurr();
      setMood("smug");
      setTimeout(() => {
        setIsPetting(false);
        setPetCount(0);
        setMood("grin");
      }, 3000);
    }
  };

  const handleFlipToCard = (e?: React.MouseEvent) => {
    if (!interactive) return;
    e?.stopPropagation();
    if (soundEnabled) sfx.playChime();
    setViewMode("affirmation");
  };

  const handleFlipToFace = (e?: React.MouseEvent) => {
    if (!interactive) return;
    e?.stopPropagation();
    if (soundEnabled) sfx.playMorph();
    setViewMode("face");
    const happyMoods: CharacterMood[] = ["grin", "smug", "love"];
    const randomHappy =
      happyMoods[Math.floor(Math.random() * happyMoods.length)];
    setMood(randomHappy);
  };

  const lastClickTimeRef = useRef(0);

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (isDraggingRef.current && dragDistanceRef.current > 10) return;

    if (isCardMode) {
      handleFlipToFace(e);
      return;
    }

    const now = performance.now();
    const timeSinceLast = now - lastClickTimeRef.current;
    lastClickTimeRef.current = now;

    if (timeSinceLast < 380) {
      handleFlipToCard(e);
    } else {
      handlePoke(e);
    }
  };

  // Face theme palettes
  const themes = {
    monochrome: {
      bodyColor: "#ffffff",
      faceFill: "#09090b",
      accent: "#f4f4f5",
      glow: "rgba(0,0,0,0.12)",
      border: "#18181b",
      blush: "rgba(0,0,0,0.09)",
    },
    bubblegum: {
      bodyColor: "#fff1f2",
      faceFill: "#1e1b4b",
      accent: "#fda4af",
      glow: "rgba(244,63,94,0.22)",
      border: "#e11d48",
      blush: "#fb7185",
    },
    matcha: {
      bodyColor: "#f0fdf4",
      faceFill: "#064e3b",
      accent: "#a7f3d0",
      glow: "rgba(16,185,129,0.22)",
      border: "#059669",
      blush: "#34d399",
    },
    sunset: {
      bodyColor: "#fffbeb",
      faceFill: "#451a03",
      accent: "#fed7aa",
      glow: "rgba(249,115,22,0.22)",
      border: "#ea580c",
      blush: "#fb923c",
    },
    cyberpunk: {
      bodyColor: "#090d16",
      faceFill: "#38bdf8",
      accent: "#f43f5e",
      glow: "rgba(56,189,248,0.35)",
      border: "#38bdf8",
      blush: "#f43f5e",
    },
  };

  // In "Breathe with me", Mochi warms up as the user slows down their breathing
  const isWarmedUp = breatheWithMeActive && calmProgress > 0.28;
  const activeFaceTheme = isWarmedUp
    ? {
      bodyColor: calmProgress > 0.65 ? "#fff5f5" : "#fffaf9",
      faceFill: "#18181b",
      accent: "#fecdd3",
      glow:
        calmProgress > 0.65
          ? "rgba(251,113,133,0.28)"
          : "rgba(251,146,60,0.18)",
      border: calmProgress > 0.65 ? "#be123c" : "#18181b",
      blush: "#fb7185",
    }
    : themes[colorTheme] || themes.monochrome;

  const activeBodyColor = isCardMode
    ? currentAffirmation.theme.bg
    : activeFaceTheme.bodyColor;
  const activeBorderColor = isCardMode
    ? currentAffirmation.theme.border
    : currentMood === "dormant"
      ? "#b4afa8"
      : activeFaceTheme.border;
  const activeGlowColor = isCardMode
    ? currentAffirmation.theme.glow
    : activeFaceTheme.glow;

  const clampedAwakening = Math.max(0, Math.min(1, awakeningProgress));
  const halfBloodLen = clampedAwakening * 50;

  const showPurrBadge =
    !isCardMode && !showCoachCard && (isPetting || isCoRegulatingPurr);

  return (
    <div
      ref={containerRef}
      className={`relative select-none flex flex-col items-center justify-center w-full max-w-[330px] sm:max-w-[380px] md:max-w-[420px] aspect-[400/344] ${className}`}
      style={{ touchAction: "none" }}
    >
      {/* ─── Floating Mood Particles ───────────────────────────────── */}
      <AnimatePresence>
        {!isCardMode && !showCoachCard && currentMood === "sleepy" && (
          <motion.div
            key="mood-particle-sleepy"
            initial={{ opacity: 0, x: -10, y: 0 }}
            animate={{
              opacity: [0, 1, 0],
              x: [0, 18, 30],
              y: [-5, -35, -60],
            }}
            transition={{ repeat: Infinity, duration: 2.8, ease: "easeOut" }}
            className="absolute -top-4 right-10 text-xl font-bold font-mono text-neutral-400 pointer-events-none z-20"
          >
            z Z Z
          </motion.div>
        )}
        {showPurrBadge && (
          <motion.div
            key="mood-particle-purr"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1.15, y: -24 }}
            exit={{ opacity: 0 }}
            className="absolute -top-4 text-xl font-bold text-amber-500 pointer-events-none z-20 font-caveat tracking-wide"
          >
            ✨ purr ✨
          </motion.div>
        )}
        {!isCardMode && !showCoachCard && currentMood === "dizzy" && (
          <motion.div
            key="mood-particle-dizzy"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.8, ease: "linear" }}
            className="absolute -top-8 text-2xl pointer-events-none z-20"
          >
            💫 💫
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Elastic Drag & Interactive Container ──────────────────── */}
      <motion.div
        drag={interactive && !isCardMode}
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        dragElastic={0.4}
        dragSnapToOrigin={true}
        onDragStart={() => {
          isDraggingRef.current = true;
          dragDistanceRef.current = 0;
          if (currentMood !== "dizzy") setMood("surprised");
        }}
        onDrag={(_, info) => {
          setDragOffset({ x: info.offset.x, y: info.offset.y });
          dragDistanceRef.current = Math.hypot(info.offset.x, info.offset.y);
        }}
        onDragEnd={(_, info) => {
          const dist = Math.hypot(info.offset.x, info.offset.y);
          setDragOffset({ x: 0, y: 0 });

          if (dist > 35) {
            if (soundEnabled) sfx.playBoing();
            pokeRippleRef.current = {
              angle: Math.atan2(info.offset.y, info.offset.x),
              startTime: performance.now(),
              duration: 1100,
              strength: Math.min(2.0, dist / 35),
            };
            setMood("smug");
          }

          setTimeout(() => {
            isDraggingRef.current = false;
          }, 120);
        }}
        onClick={interactive ? handleContainerClick : undefined}
        onDoubleClick={interactive && !isCardMode ? handleFlipToCard : undefined}
        onMouseMove={interactive ? handlePetMove : undefined}
        style={{
          rotate: headTilt,
        }}
        animate={{
          scaleX: isPressed
            ? 1.25
            : (cameraActive || breatheWithMeActive) && !isCardMode
              ? 1 + breathPhase * 0.13 + (isHeartbeatPulse ? 0.025 : 0)
              : 1,
          scaleY: isPressed
            ? 0.78
            : (cameraActive || breatheWithMeActive) && !isCardMode
              ? 1 + breathPhase * 0.13 + (isHeartbeatPulse ? 0.025 : 0)
              : 1,
          y: isPressed
            ? 12
            : currentMood === "dizzy"
              ? [0, -3, 3, 0]
              : [0, -5, 0],
          x: currentMood === "dizzy" ? [-3, 3, -2, 2, 0] : 0,
        }}
        transition={{
          y: {
            repeat: Infinity,
            duration: currentMood === "dizzy" ? 0.2 : 3.6,
            ease: "easeInOut",
          },
          x: {
            repeat: Infinity,
            duration: currentMood === "dizzy" ? 0.18 : 0,
            ease: "linear",
          },
          scaleX: { type: "spring", stiffness: 120, damping: 18 },
          scaleY: { type: "spring", stiffness: 120, damping: 18 },
        }}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.95 }}
        className={`w-full h-full flex items-center justify-center ${isCardMode ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
          } relative`}
      >
        {/* ─── Unified Dynamic SVG Character Canvas (Wavy Border) ──── */}
        <svg
          viewBox="0 0 400 344"
          className="w-full h-full overflow-visible select-none drop-shadow-xl"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <filter
              id="character-dynamic-shadow"
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              <feDropShadow
                dx="0"
                dy="16"
                stdDeviation="18"
                floodColor={activeGlowColor}
                floodOpacity="1"
              />
            </filter>

            <linearGradient
              id="character-sheen-grad"
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <stop
                offset="0%"
                stopColor="#ffffff"
                stopOpacity={isCardMode ? 0.15 : 0.35}
              />
              <stop
                offset="100%"
                stopColor="#000000"
                stopOpacity={isCardMode ? 0.12 : 0.04}
              />
            </linearGradient>
          </defs>

          {/* ════════════ 1. ANIMATED MOVING WAVY BODY BORDER LAYER ════════════ */}
          <g filter="url(#character-dynamic-shadow)">
            <path
              ref={bodyPathRef}
              fill={activeBodyColor}
              stroke={activeBorderColor}

              strokeWidth={isCardMode ? "3.5" : "4.5"}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-[fill,stroke] duration-500 ease-out"
            />

            {/* Blood-flow awakening border: splits left & right from top center until meeting at bottom */}
            <path
              ref={bloodPathRef}
              pathLength={100}
              fill="none"
              stroke="#dc2626"
              strokeWidth="5.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={`${halfBloodLen} ${Math.max(
                0,
                100 - 2 * halfBloodLen
              )} ${halfBloodLen} 0`}
              style={{
                opacity:
                  !isCardMode && clampedAwakening > 0 && clampedAwakening < 1
                    ? 1
                    : 0,
                filter: "drop-shadow(0 0 8px rgba(220, 38, 38, 0.45))",
                transition:
                  "stroke-dasharray 0.38s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.45s ease",
              }}
              className="pointer-events-none"
            />

            <path
              ref={innerPathRef}
              fill="url(#character-sheen-grad)"
              stroke="none"
              opacity="0.65"
              className="pointer-events-none"
            />
          </g>

          {/* ════════════ 2. FACE MODE: BLUSH & FACIAL FEATURES ════════════ */}
          <AnimatePresence>
            {!isCardMode && !showCoachCard && (
              <motion.g
                key="face-layer"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.25 }}
              >
                {/* Cheeks */}
                <motion.g
                  style={{
                    x: currentMood === "dormant" ? 0 : mouseX,
                    y: currentMood === "dormant" ? 0 : mouseY,
                  }}
                  animate={{
                    opacity:
                      currentMood === "dormant"
                        ? 0
                        : currentMood === "smug" ||
                          currentMood === "love" ||
                          isPetting ||
                          isWarmedUp
                          ? 0.85
                          : 0.28,
                    scale: currentMood === "love" || isWarmedUp ? 1.25 : 1,
                  }}
                  className="pointer-events-none"
                >
                  <ellipse
                    cx="95"
                    cy="200"
                    rx="18"
                    ry="9"
                    fill={activeFaceTheme.blush}
                  />
                  <ellipse
                    cx="305"
                    cy="200"
                    rx="18"
                    ry="9"
                    fill={activeFaceTheme.blush}
                  />
                </motion.g>

                {/* Eyes & Mouth Feature Layer */}
                <motion.g
                  style={{
                    x: currentMood === "dormant" ? 0 : mouseX,
                    y: currentMood === "dormant" ? 0 : mouseY,
                  }}
                >
                  {/* Eyes Layer */}
                  <g fill={activeFaceTheme.faceFill}>
                    {currentMood === "dormant" && (
                      <motion.g
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.28 }}
                        exit={{ opacity: 0 }}
                        fill="none"
                        stroke={activeFaceTheme.faceFill}
                        strokeWidth="8.5"
                        strokeLinecap="round"
                      >
                        {/* Classic plush/spirit doll stitched ×   × eyes */}
                        <path d="M 122 102 L 156 136 M 156 102 L 122 136" />
                        <path d="M 244 102 L 278 136 M 278 102 L 244 136" />
                      </motion.g>
                    )}

                    {(currentMood === "grin" || currentMood === "calm") && (
                      <motion.g
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{
                          opacity: isBlinking ? 0 : 1,
                          scale: isBlinking ? 0.1 : 1,
                        }}
                        transition={{ duration: 0.1 }}
                      >
                        <circle cx="140" cy="115" r="14.5" />
                        <circle cx="260" cy="115" r="14.5" />
                      </motion.g>
                    )}

                    {currentMood === "curious" && (
                      <motion.g
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: isBlinking ? 0 : 1, scale: 1 }}
                        transition={{ duration: 0.18, type: "spring" }}
                      >
                        <ellipse
                          cx="115"
                          cy="180"
                          rx="20"
                          ry="29"
                          transform="rotate(-6 115 180)"
                        />
                        <circle cx="268" cy="115" r="32" />
                      </motion.g>
                    )}

                    {(currentMood === "smug" || currentMood === "love") && (
                      <motion.g
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        fill="none"
                        stroke={activeFaceTheme.faceFill}
                        strokeWidth="18"
                        strokeLinecap="round"
                      >
                        <path d="M 98 152 Q 132 134 162 148" />
                        <path d="M 238 148 Q 268 134 302 152" />
                      </motion.g>
                    )}

                    {currentMood === "surprised" && (
                      <motion.g
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 400 }}
                      >
                        <circle cx="130" cy="105" r="22" />
                        <circle cx="270" cy="105" r="22" />
                        <circle cx="136" cy="98" r="6" fill="#ffffff" />
                        <circle cx="276" cy="98" r="6" fill="#ffffff" />
                      </motion.g>
                    )}

                    {currentMood === "sleepy" && (
                      <motion.g
                        fill="none"
                        stroke={activeFaceTheme.faceFill}
                        strokeWidth="12"
                        strokeLinecap="round"
                      >
                        <path d="M 110 135 L 165 140" />
                        <path d="M 235 140 L 290 135" />
                      </motion.g>
                    )}

                    {currentMood === "dizzy" && (
                      <motion.g
                        animate={{ rotate: 360 }}
                        transition={{
                          repeat: Infinity,
                          duration: 1.2,
                          ease: "linear",
                        }}
                        fill="none"
                        stroke={activeFaceTheme.faceFill}
                        strokeWidth="10"
                        strokeLinecap="round"
                      >
                        <path d="M 125 105 L 155 135 M 155 105 L 125 135" />
                        <path d="M 245 105 L 275 135 M 275 105 L 245 135" />
                      </motion.g>
                    )}

                    {currentMood === "poked" && (
                      <motion.g initial={{ scale: 0.5 }} animate={{ scale: 1 }}>
                        <circle cx="135" cy="110" r="18" />
                        <circle cx="265" cy="110" r="18" />
                        <circle cx="140" cy="104" r="5" fill="#ffffff" />
                        <circle cx="270" cy="104" r="5" fill="#ffffff" />
                      </motion.g>
                    )}
                  </g>

                  {/* Mouth Layer */}
                  <g>
                    {currentMood === "dormant" && (
                      <motion.g
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.22 }}
                        exit={{ opacity: 0 }}
                        fill="none"
                        stroke={activeFaceTheme.faceFill}
                        strokeWidth="5.5"
                        strokeLinecap="round"
                      >
                        <path d="M 176 202 L 224 202" />
                        <path
                          d="M 188 195 L 188 209 M 200 195 L 200 209 M 212 195 L 212 209"
                          strokeWidth="4"
                        />
                      </motion.g>
                    )}

                    {currentMood === "calm" && (
                      <motion.path
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.2 }}
                        d="M 164 196 Q 200 222 236 196"
                        fill="none"
                        stroke={activeFaceTheme.faceFill}
                        strokeWidth="15"
                        strokeLinecap="round"
                      />
                    )}

                    {(currentMood === "grin" || currentMood === "love") && (
                      <motion.g
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.2 }}
                      >
                        <path
                          d="
                            M 85 178
                            C 140 162, 260 162, 315 178
                            C 335 192, 335 220, 310 238
                            C 265 268, 135 268, 90 238
                            C 65 220, 65 192, 85 178
                            Z
                          "
                          fill={activeFaceTheme.faceFill}
                        />
                        <g fill={activeFaceTheme.bodyColor}>
                          <path d="M 124 172 Q 125 212, 144 212 Q 163 212, 164 172 Z" />
                          <path d="M 178 174 Q 180 220, 200 220 Q 220 220, 222 174 Z" />
                          <path d="M 236 172 Q 237 212, 256 212 Q 275 212, 276 172 Z" />
                        </g>
                      </motion.g>
                    )}

                    {currentMood === "curious" && (
                      <motion.path
                        initial={{ opacity: 0, scale: 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.2, type: "spring" }}
                        d="M 162 195 Q 182 225 204 195"
                        fill="none"
                        stroke={activeFaceTheme.faceFill}
                        strokeWidth="16"
                        strokeLinecap="round"
                        transform="rotate(6 183 205)"
                      />
                    )}

                    {currentMood === "smug" && (
                      <motion.path
                        initial={{ opacity: 0, pathLength: 0 }}
                        animate={{ opacity: 1, pathLength: 1 }}
                        transition={{ duration: 0.25 }}
                        d="M 166 195 Q 180 180 196 194 Q 212 208 226 194"
                        fill="none"
                        stroke={activeFaceTheme.faceFill}
                        strokeWidth="16"
                        strokeLinecap="round"
                      />
                    )}

                    {currentMood === "surprised" && (
                      <motion.ellipse
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        cx="200"
                        cy="205"
                        rx="24"
                        ry="36"
                        fill={activeFaceTheme.faceFill}
                      />
                    )}

                    {currentMood === "sleepy" && (
                      <motion.ellipse
                        cx="200"
                        cy="200"
                        rx="10"
                        ry="12"
                        fill={activeFaceTheme.faceFill}
                      />
                    )}

                    {currentMood === "dizzy" && (
                      <motion.path
                        d="M 155 210 Q 170 190 185 210 Q 200 230 215 210 Q 230 190 245 210"
                        fill="none"
                        stroke={activeFaceTheme.faceFill}
                        strokeWidth="12"
                        strokeLinecap="round"
                      />
                    )}

                    {currentMood === "poked" && (
                      <motion.ellipse
                        cx="200"
                        cy="210"
                        rx="28"
                        ry="22"
                        fill={activeFaceTheme.faceFill}
                      />
                    )}
                  </g>
                </motion.g>
              </motion.g>
            )}
          </AnimatePresence>
        </svg>

        {/* ════════════ 2.5 COACH QUOTE CARD IN PACED BREATHING ════════════ */}
        <AnimatePresence>
          {showCoachCard && breatheCoachMessage && (
            <motion.div
              key={breatheCoachMessage.lines.join(" ")}
              initial={{ opacity: 0, scale: 0.9, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -6 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="absolute inset-5 sm:inset-7 flex flex-col items-center justify-center p-6 sm:p-8 pointer-events-none select-none z-20 text-center"
              style={{
                x: mouseX,
                y: mouseY,
              }}
            >
              <div className="flex flex-col gap-1.5 items-center justify-center max-w-[290px]">
                {breatheCoachMessage.lines.map((line, idx) => (
                  <p
                    key={idx}
                    className="font-caveat text-[24px] sm:text-[28px] md:text-[32px] font-bold leading-tight tracking-wide text-foreground drop-shadow-xs"
                    style={{ fontFamily: "var(--font-caveat), cursive" }}
                  >
                    {line}
                  </p>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ════════════ 3. CLEAN AFFIRMATION CARD ════════════ */}
        <AnimatePresence>
          {isCardMode && (
            <motion.div
              key="affirmation-content"
              initial={{ opacity: 0, scale: 0.85, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: -8 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="absolute inset-5 sm:inset-7 flex flex-col justify-between p-3 sm:p-5 pointer-events-auto select-none"
              style={{
                x: mouseX,
                y: mouseY,
                color: currentAffirmation.theme.text,
              }}
            >
              {currentAffirmation.particles === "raindrops" && (
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  {[
                    { top: "10%", left: "46%", delay: 0, scale: 0.8 },
                    { top: "20%", left: "70%", delay: 0.5, scale: 1.05 },
                    { top: "32%", left: "18%", delay: 0.9, scale: 0.95 },
                    { top: "42%", left: "84%", delay: 0.2, scale: 1.15 },
                    { top: "58%", left: "32%", delay: 0.7, scale: 0.85 },
                    { top: "60%", left: "72%", delay: 1.1, scale: 0.9 },
                    { top: "74%", left: "54%", delay: 0.4, scale: 1.05 },
                  ].map((drop, i) => (
                    <motion.div
                      key={i}
                      style={{ top: drop.top, left: drop.left }}
                      animate={{
                        y: [-5, 7, -5],
                        opacity: [0.65, 0.95, 0.65],
                      }}
                      transition={{
                        repeat: Infinity,
                        duration: 2.2,
                        delay: drop.delay,
                        ease: "easeInOut",
                      }}
                      className="absolute"
                    >
                      <svg
                        width={12 * drop.scale}
                        height={18 * drop.scale}
                        viewBox="0 0 14 20"
                        fill="#60a5fa"
                        opacity="0.85"
                      >
                        <path d="M7 0 C7 0 0 10 0 14 C0 17.866 3.134 20 7 20 C10.866 20 14 17.866 14 14 C14 10 7 0 7 0 Z" />
                      </svg>
                    </motion.div>
                  ))}
                </div>
              )}

              {currentAffirmation.cardType === "notification" ? (
                <div className="relative w-full h-full flex flex-col justify-between items-center z-10">
                  <div className="w-full bg-[#f6f4fa]/95 text-slate-800 rounded-2xl px-4 py-3.5 sm:px-5 sm:py-4 shadow-md border border-white/80 backdrop-blur-md mt-1">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <svg
                          className="w-3.5 h-3.5 fill-[#7c5ea8] text-[#7c5ea8]"
                          viewBox="0 0 24 24"
                        >
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                        </svg>
                        <span className="text-[10px] sm:text-[11px] font-sans font-semibold tracking-wider text-[#68538e] uppercase">
                          {currentAffirmation.badge || "REMINDER"}
                        </span>
                      </div>
                      <span className="text-[10px] sm:text-[11px] font-mono text-slate-400">
                        now
                      </span>
                    </div>
                    <div className="font-serif italic text-[18px] sm:text-[21px] font-normal leading-snug tracking-wide text-[#2e2544] text-left">
                      {currentAffirmation.lines.map((line, idx) => (
                        <div key={idx}>{line}</div>
                      ))}
                    </div>
                  </div>

                  <div className="w-full flex justify-start pl-3 pointer-events-none">
                    <svg
                      className="w-20 h-24 sm:w-24 sm:h-28 opacity-90"
                      viewBox="0 0 100 140"
                      fill="none"
                    >
                      <path
                        d="M 50 140 C 48 105, 52 75, 48 48 C 44 38, 32 30, 26 40 C 20 52, 35 58, 44 48 C 48 42, 50 18, 64 22 C 76 27, 74 42, 66 48 C 58 54, 46 48, 48 44"
                        stroke="rgba(255, 255, 255, 0.9)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M 49 85 C 38 80, 28 88, 34 98 C 40 104, 47 96, 49 92"
                        stroke="rgba(255, 255, 255, 0.8)"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                </div>
              ) : currentAffirmation.cardType === "brushstroke" ? (
                <div className="relative w-full h-full flex flex-col items-center justify-center z-10">
                  <div className="relative w-full py-5 px-4 rounded-3xl flex flex-col items-start justify-center">
                    <svg
                      className="absolute inset-0 w-full h-full pointer-events-none -z-10 filter drop-shadow-xs"
                      viewBox="0 0 300 190"
                      preserveAspectRatio="none"
                      fill="none"
                    >
                      <path
                        d="M 18 30 Q 150 18 282 28 Q 295 44 285 64 Q 150 74 12 58 Q 5 42 18 30 Z"
                        fill="#cbe8fc"
                        opacity="0.85"
                      />
                      <path
                        d="M 10 54 Q 150 44 290 50 Q 300 80 288 106 Q 150 114 15 102 Q 2 76 10 54 Z"
                        fill="#a6d7fa"
                        opacity="0.9"
                      />
                      <path
                        d="M 22 96 Q 150 90 285 95 Q 295 124 278 146 Q 150 156 25 142 Q 12 119 22 96 Z"
                        fill="#8eccfa"
                        opacity="0.95"
                      />
                      <path
                        d="M 42 136 Q 150 132 260 138 Q 270 160 250 174 Q 150 180 55 170 Q 38 155 42 136 Z"
                        fill="#bde1fc"
                        opacity="0.8"
                      />
                    </svg>

                    <div className="flex flex-col gap-0.5 text-left w-full pl-2">
                      {currentAffirmation.lines.map((line, idx) => (
                        <span
                          key={idx}
                          className="font-cursive text-[17px] sm:text-[20px] font-semibold text-[#0c3b6d] leading-snug tracking-normal drop-shadow-xs"
                        >
                          {line}
                        </span>
                      ))}
                    </div>

                    {currentAffirmation.author && (
                      <div className="self-end mt-1.5 pr-2 font-cursive text-[16px] sm:text-[18px] font-bold text-[#0c3b6d]">
                        {currentAffirmation.author}
                      </div>
                    )}
                  </div>
                </div>
              ) : currentAffirmation.cardType === "slate-quote" ? (
                <div className="relative w-full h-full flex flex-col justify-between items-start p-2 sm:p-4 z-10">
                  <div className="text-2xl sm:text-3xl font-serif text-white/80 leading-none select-none">
                    &ldquo;
                  </div>

                  <div className="flex flex-col gap-1 my-auto text-left w-full pl-2">
                    {currentAffirmation.lines.filter(Boolean).map((line, idx) => (
                      <span
                        key={idx}
                        className="font-mono uppercase tracking-widest text-[14px] sm:text-[17px] font-bold text-white drop-shadow-sm leading-relaxed"
                      >
                        {line}
                      </span>
                    ))}
                    <span className="text-right text-2xl sm:text-3xl font-serif text-white/80 leading-none select-none pr-2">
                      &rdquo;
                    </span>
                  </div>

                  {currentAffirmation.author && (
                    <div className="self-end text-right font-caveat text-sm sm:text-base text-white/80 italic pr-2">
                      {currentAffirmation.author}
                    </div>
                  )}
                </div>
              ) : (
                <div className="relative w-full h-full flex flex-col justify-between p-2 sm:p-4 z-10">
                  {currentAffirmation.badge && (
                    <div className="flex items-center justify-start">
                      <div className="inline-flex flex-col">
                        <span className="text-[10px] sm:text-[11px] font-mono tracking-widest font-bold uppercase opacity-90">
                          {currentAffirmation.badge}
                        </span>
                        <span
                          className="w-full h-[1.5px] rounded-full mt-0.5 opacity-80"
                          style={{
                            backgroundColor: currentAffirmation.theme.text,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  <div
                    className={`py-2 my-auto flex flex-col gap-1.5 ${currentAffirmation.particles === "raindrops" ||
                        currentAffirmation.fontStyle === "serif-italic"
                        ? "text-center items-center"
                        : "text-left items-start"
                      }`}
                  >
                    {currentAffirmation.lines.map((line, idx) => {
                      const hasOval =
                        currentAffirmation.highlight?.style === "oval" &&
                        line.includes(currentAffirmation.highlight.text);
                      const hasUnderline =
                        currentAffirmation.highlight?.style === "underline" &&
                        line.includes(currentAffirmation.highlight.text);

                      const isSerif =
                        currentAffirmation.fontStyle === "serif-italic";
                      const fontClass = isSerif
                        ? "font-serif italic text-[18px] sm:text-[22px] font-normal leading-relaxed tracking-wide"
                        : "font-caveat text-[22px] sm:text-[27px] md:text-[30px] font-bold leading-tight tracking-wide";

                      return (
                        <div
                          key={idx}
                          className={`${fontClass} drop-shadow-xs`}
                          style={{
                            color: currentAffirmation.theme.text,
                            fontFamily: isSerif
                              ? "var(--font-cormorant), serif"
                              : "var(--font-caveat), cursive",
                          }}
                        >
                          {hasOval ? (
                            <span className="relative inline-block my-0.5">
                              <span className="relative z-10 px-2 py-0.5">
                                {line}
                              </span>
                              <svg
                                className="absolute -inset-x-2 -inset-y-1 w-[calc(100%+16px)] h-[calc(100%+8px)] pointer-events-none"
                                viewBox="0 0 160 50"
                                preserveAspectRatio="none"
                                fill="none"
                              >
                                <path
                                  d="M 12 25 C 10 9, 150 7, 152 25 C 154 43, 8 44, 10 24"
                                  stroke={currentAffirmation.theme.text}
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </span>
                          ) : hasUnderline ? (
                            <span className="relative inline-block">
                              <span className="relative z-10">{line}</span>
                              <svg
                                className="absolute -bottom-1.5 inset-x-0 w-full h-2.5 pointer-events-none"
                                viewBox="0 0 100 10"
                                preserveAspectRatio="none"
                                fill="none"
                              >
                                <path
                                  d="M 2 5 Q 50 10 98 4"
                                  stroke={currentAffirmation.theme.text}
                                  strokeWidth="2.8"
                                  strokeLinecap="round"
                                />
                              </svg>
                            </span>
                          ) : (
                            line
                          )}
                        </div>
                      );
                    })}

                    {currentAffirmation.watermark && (
                      <span
                        className="text-[10px] font-mono tracking-widest opacity-50 pt-2 block"
                        style={{ color: currentAffirmation.theme.text }}
                      >
                        {currentAffirmation.watermark}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

