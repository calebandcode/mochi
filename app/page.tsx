"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ReactiveCharacter,
  CharacterMood,
  sfx,
} from "@/components/mochi-character";
import { MilestoneCelebration } from "@/components/milestone-celebration";
import { ConsentModal } from "@/components/consent-modal";
import { recordStillnessSession } from "@/lib/streak";
import { downloadQuoteCard } from "@/lib/download-quote-card";
import { AFFIRMATIONS } from "@/lib/affirmations-data";
import { useSmartSpectraCamera } from "@/lib/smartspectra-sensor";

type StoryStage = "dormant" | "awakening" | "alive";

const COACH_MESSAGES = [
  {
    lines: [
      "Empty the lungs all the way...",
      "let your shoulders drop.",
    ],
  },
  {
    lines: [
      "Pulse is settling down.",
      "You've got this rhythm.",
    ],
  },
  {
    lines: [
      "Smooth, long exhale.",
      "Your heart is slowing with you.",
    ],
  },
  {
    lines: [
      "Look at that steady rhythm.",
      "Grounded, calm, and in control.",
    ],
  },
  {
    lines: [
      "Soft breath out.",
      "Releasing tension with every second.",
    ],
  },
];

const IDLE_MINDFUL_QUOTES = [
  { lines: ["let the noise out...", "be here now."] },
  { lines: ["soften your shoulders...", "take a slow breath."] },
  { lines: ["you don't have to rush.", "this moment is enough."] },
  { lines: ["unclench your jaw...", "let the day settle."] },
  { lines: ["quiet mind,", "steady heart."] },
  { lines: ["inhale space,", "exhale hurry."] },
];

export default function MochiPage() {
  const [selectedMood, setSelectedMood] = useState<CharacterMood>("dormant");
  const [soundEnabled] = useState(true);

  const [storyStage, setStoryStage] = useState<StoryStage>("dormant");
  const [awakeningProgress, setAwakeningProgress] = useState(0);
  const [cameraEnabled, setCameraEnabled] = useState(false);

  const [showNewspaperCard, setShowNewspaperCard] = useState(true);
  const [showConsentModal, setShowConsentModal] = useState(false);

  const lastProcessedBeatRef = useRef<number>(0);
  const lastUserInteractionRef = useRef<number>(0);

  const [baselineBpm, setBaselineBpm] = useState<number | null>(null);
  const [settledBpm, setSettledBpm] = useState<number | null>(null);

  const [breatheWithMe, setBreatheWithMe] = useState(false);
  const [pacedBreathPhase, setPacedBreathPhase] = useState(0);
  const [pacedBreathLabel, setPacedBreathLabel] = useState<string>("get ready...");
  const [calmProgress, setCalmProgress] = useState(0);

  const breatheStartTimeRef = useRef<number | null>(null);
  const lastPacedLabelRef = useRef<string>("breathe in...");
  const lastPacedMoodRef = useRef<string>("calm");
  const lastProgressCommitRef = useRef<number>(0);

  const [breatheCoachMessage, setBreatheCoachMessage] = useState<{
    badge?: string;
    lines: string[];
    hint?: string;
  } | null>(null);
  const lastCoachMsgRef = useRef<string | null>(null);

  const [idleQuoteMessage, setIdleQuoteMessage] = useState<{
    badge?: string;
    lines: string[];
    hint?: string;
  } | null>(null);

  const [showMilestone, setShowMilestone] = useState(false);
  const [milestoneData, setMilestoneData] = useState<{
    streak: number;
    isNewDayIncrement?: boolean;
    totalSessions?: number;
    startBpm: number;
    endBpm: number;
    calmGain: number;
  } | null>(null);

  const [viewMode, setViewMode] = useState<"face" | "affirmation">("face");
  const [affirmationIndex, setAffirmationIndex] = useState(0);
  const [isDownloadingCard, setIsDownloadingCard] = useState(false);

  const { isReady, snapshot } = useSmartSpectraCamera(cameraEnabled);

  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const baselineBpmRef = useRef(baselineBpm);
  baselineBpmRef.current = baselineBpm;

  useEffect(() => {
    if (
      storyStage === "alive" &&
      snapshot.facePresent &&
      snapshot.pulseBpm > 0 &&
      baselineBpm === null
    ) {
      setBaselineBpm(snapshot.pulseBpm);
    }
  }, [storyStage, snapshot.facePresent, snapshot.pulseBpm, baselineBpm]);

  useEffect(() => {
    if (
      storyStage !== "awakening" ||
      !snapshot.sdkBridgeConnected ||
      !snapshot.facePresent ||
      snapshot.pulseBpm > 0
    ) {
      return;
    }

    const calibTimer = setInterval(() => {
      setAwakeningProgress((prev) =>
        prev < 0.85 ? Math.min(0.85, prev + 0.035) : prev
      );
    }, 500);
    return () => clearInterval(calibTimer);
  }, [
    storyStage,
    snapshot.sdkBridgeConnected,
    snapshot.facePresent,
    snapshot.pulseBpm,
  ]);

  useEffect(() => {
    if (storyStage !== "awakening") return;

    if (snapshot.facePresent && snapshot.pulseBpm > 0) {
      setAwakeningProgress(1);
      if (soundEnabled) sfx.playHeartbeat();
      const wakeTimer = setTimeout(() => {
        if (soundEnabled) sfx.playChime();
        setStoryStage("alive");
        setSelectedMood("grin");
      }, 420);
      return () => clearTimeout(wakeTimer);
    }
  }, [storyStage, snapshot.facePresent, snapshot.pulseBpm, soundEnabled]);

  useEffect(() => {
    if (storyStage !== "awakening" || snapshot.facePresent) return;
    const drainTimer = setInterval(() => {
      setAwakeningProgress((prev) => Math.max(0, prev - 0.03));
    }, 400);
    return () => clearInterval(drainTimer);
  }, [storyStage, snapshot.facePresent]);

  useEffect(() => {
    if (
      storyStage !== "alive" ||
      !cameraEnabled ||
      breatheWithMe ||
      viewMode === "affirmation"
    ) {
      return;
    }

    if (performance.now() - lastUserInteractionRef.current < 3500) {
      return;
    }

    if (!snapshot.facePresent) {
      setSelectedMood("sleepy");
      return;
    }

    if (snapshot.expression === "surprised") {
      setSelectedMood("surprised");
    } else if (snapshot.expression === "grin") {
      setSelectedMood("grin");
    } else {
      setSelectedMood("calm");
    }
  }, [
    storyStage,
    cameraEnabled,
    breatheWithMe,
    viewMode,
    snapshot.facePresent,
    snapshot.expression,
  ]);

  useEffect(() => {
    if (
      storyStage !== "alive" ||
      !cameraEnabled ||
      breatheWithMe ||
      viewMode !== "face" ||
      showMilestone
    ) {
      setIdleQuoteMessage(null);
      return;
    }

    let quoteIndex = 0;
    let timeoutId: NodeJS.Timeout;

    const scheduleNextQuote = () => {
      if (performance.now() - lastUserInteractionRef.current < 4500) {
        timeoutId = setTimeout(scheduleNextQuote, 5000);
        return;
      }

      const quote =
        IDLE_MINDFUL_QUOTES[quoteIndex % IDLE_MINDFUL_QUOTES.length];
      quoteIndex++;
      setIdleQuoteMessage(quote);

      timeoutId = setTimeout(() => {
        setIdleQuoteMessage(null);
        timeoutId = setTimeout(scheduleNextQuote, 13000);
      }, 5500);
    };

    timeoutId = setTimeout(scheduleNextQuote, 10000);

    return () => {
      clearTimeout(timeoutId);
      setIdleQuoteMessage(null);
    };
  }, [storyStage, cameraEnabled, breatheWithMe, viewMode, showMilestone]);

  useEffect(() => {
    if (!breatheWithMe || viewMode === "affirmation") {
      breatheStartTimeRef.current = null;
      lastCoachMsgRef.current = null;
      setPacedBreathPhase(0);
      setCalmProgress(0);
      setBreatheCoachMessage(null);
      return;
    }

    if (breatheStartTimeRef.current === null) {
      breatheStartTimeRef.current = performance.now();
      lastPacedLabelRef.current = "get ready...";
      setPacedBreathLabel("get ready...");
      lastPacedMoodRef.current = "calm";
      lastProgressCommitRef.current = 0;
      lastCoachMsgRef.current = null;
    }

    let animId: number;
    const prepDurationSec = 3.0;
    const cycleDurationSec = 18.0;
    const rewardTargetSec = 54.0; // 3 full deep, restorative calm cycles (~54s of breathing)

    const tick = () => {
      if (breatheStartTimeRef.current === null) return;
      const elapsedSec =
        (performance.now() - breatheStartTimeRef.current) / 1000;

      let phase: number;
      let nextLabel: string;
      let activeCoach: (typeof COACH_MESSAGES)[0] | null = null;

      if (elapsedSec < prepDurationSec) {
        phase = -1.0;
        nextLabel = elapsedSec < 1.6 ? "get ready..." : "settle in...";
        activeCoach = null;
      } else {
        const activeElapsed = elapsedSec - prepDurationSec;
        const cycleSec = activeElapsed % cycleDurationSec;

        if (cycleSec < 5.0) {
          const t = cycleSec / 5.0;
          phase = -Math.cos(t * Math.PI);
          nextLabel = "breathe in...";
          activeCoach = null;
        } else if (cycleSec < 8.0) {
          phase = 1.0;
          nextLabel = "hold...";
          activeCoach = null;
        } else if (cycleSec < 16.0) {
          const t = (cycleSec - 8.0) / 8.0;
          phase = Math.cos(t * Math.PI);
          nextLabel = "breathe out...";
          const cycleIdx =
            Math.floor(activeElapsed / cycleDurationSec) % COACH_MESSAGES.length;
          activeCoach = COACH_MESSAGES[cycleIdx];
        } else {
          phase = -1.0;
          nextLabel = "rest...";
          activeCoach = null;
        }
      }

      if (nextLabel !== lastPacedLabelRef.current) {
        lastPacedLabelRef.current = nextLabel;
        setPacedBreathLabel(nextLabel);
      }

      const coachKey = activeCoach ? activeCoach.lines.join(" ") : null;
      if (coachKey !== lastCoachMsgRef.current) {
        lastCoachMsgRef.current = coachKey;
        setBreatheCoachMessage(activeCoach);
      }

      setPacedBreathPhase(phase);

      const activeElapsed = Math.max(0, elapsedSec - prepDurationSec);
      const nextProgress = Math.min(1, activeElapsed / rewardTargetSec);

      if (
        Math.abs(nextProgress - lastProgressCommitRef.current) >= 0.015 ||
        nextProgress >= 1
      ) {
        lastProgressCommitRef.current = nextProgress;
        setCalmProgress(nextProgress);
      }

      let targetMood: CharacterMood = "calm";
      if (nextProgress > 0.65) {
        targetMood = "love";
      } else if (nextProgress > 0.3) {
        targetMood = "smug";
      }

      if (targetMood !== lastPacedMoodRef.current) {
        lastPacedMoodRef.current = targetMood;
        setSelectedMood(targetMood);
      }

      if (nextProgress >= 1) {
        if (soundEnabled) sfx.playChime();
        const startVal =
          baselineBpmRef.current || snapshotRef.current.pulseBpm || 75;
        const currentPulse = snapshotRef.current.pulseBpm;
        const endVal =
          currentPulse > 0 && currentPulse < startVal
            ? currentPulse
            : Math.max(58, startVal - 7);
        setBaselineBpm(startVal);
        setSettledBpm(endVal);
        breatheStartTimeRef.current = null;
        lastCoachMsgRef.current = null;
        setBreatheCoachMessage(null);
        setBreatheWithMe(false);

        const streakResult = recordStillnessSession();

        setMilestoneData({
          streak: streakResult.streak,
          isNewDayIncrement: streakResult.isNewDayIncrement,
          totalSessions: streakResult.totalSessions,
          startBpm: startVal,
          endBpm: endVal,
          calmGain: Math.max(1, startVal - endVal),
        });
        setShowMilestone(true);
        return;
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [breatheWithMe, viewMode, soundEnabled]);

  const handleStartAwakening = useCallback(() => {
    setShowNewspaperCard(false);
    setCameraEnabled(true);
    setStoryStage("awakening");
    setSelectedMood("dormant");
  }, []);

  const handleNextAffirmation = useCallback(() => {
    setAffirmationIndex((prev) => (prev + 1) % AFFIRMATIONS.length);
  }, []);

  const handlePrevAffirmation = useCallback(() => {
    setAffirmationIndex(
      (prev) => (prev - 1 + AFFIRMATIONS.length) % AFFIRMATIONS.length
    );
  }, []);

  const handleShuffleAffirmation = useCallback(() => {
    setAffirmationIndex((prev) => {
      let next = Math.floor(Math.random() * AFFIRMATIONS.length);
      if (next === prev) next = (prev + 1) % AFFIRMATIONS.length;
      return next;
    });
  }, []);

  const handleDownloadCard = async () => {
    if (isDownloadingCard) return;
    setIsDownloadingCard(true);
    if (soundEnabled) sfx.playPop();
    try {
      const el = document.getElementById("mochi-character-card");
      const currentAffirmation =
        AFFIRMATIONS[affirmationIndex % AFFIRMATIONS.length];
      await downloadQuoteCard(
        el,
        currentAffirmation,
        `mochi-quote-${affirmationIndex + 1}.png`
      );
    } finally {
      setIsDownloadingCard(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (viewMode === "affirmation") {
        if (e.key === "ArrowRight" || e.key === " ") {
          e.preventDefault();
          handleNextAffirmation();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          handlePrevAffirmation();
        }
        return;
      }

      if (storyStage === "alive" && cameraEnabled && !breatheWithMe) {
        if (e.key.toLowerCase() === "o") {
          setSelectedMood("surprised");
        } else if (e.key.toLowerCase() === "s") {
          setSelectedMood("grin");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    viewMode,
    storyStage,
    cameraEnabled,
    breatheWithMe,
    handleNextAffirmation,
    handlePrevAffirmation,
  ]);

  const currentAffirmation = AFFIRMATIONS[affirmationIndex];
  const activeBreathPhase =
    storyStage !== "alive"
      ? 0
      : breatheWithMe
        ? pacedBreathPhase
        : cameraEnabled
          ? snapshot.breathPhase
          : 0;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col justify-between overflow-hidden relative selection:bg-[#fef08a] selection:text-black">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 flex items-center justify-center z-0 overflow-hidden"
      >
        <div
          className="w-[420px] sm:w-[540px] h-[420px] sm:h-[540px] rounded-full blur-3xl opacity-80 transition-opacity duration-700"
          style={{
            background:
              "radial-gradient(circle, rgba(253, 186, 116, 0.42) 0%, rgba(254, 205, 211, 0.34) 42%, rgba(255, 255, 255, 0) 72%)",
          }}
        />
      </div>

      <header className="fixed top-0 inset-x-0 z-30 px-6 sm:px-10 py-5 flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-4">
          <button
            type="button"
            onClick={() => {
              setViewMode("face");
              setBreatheWithMe(false);
            }}
            className="font-caveat text-2xl font-bold tracking-tight text-foreground transition-opacity hover:opacity-75 cursor-pointer"
          >
            mochi.
          </button>
        </div>

        <AnimatePresence>
          {viewMode === "affirmation" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: -6 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="pointer-events-auto"
            >
              <button
                type="button"
                onClick={handleDownloadCard}
                disabled={isDownloadingCard}
                aria-label="Download card"
                className="group flex items-center h-10 sm:h-11 rounded-full bg-[#0a0a0a] hover:bg-[#1a1a1a] active:scale-[0.96] text-white shadow-[0_4px_14px_rgba(0,0,0,0.22)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.32)] transition-all duration-300 ease-out overflow-hidden px-3 cursor-pointer disabled:opacity-70"
              >
                <div className="flex items-center justify-center shrink-0 w-4 h-4">
                  <svg
                    className={`w-4 h-4 ${isDownloadingCard ? "animate-bounce" : ""}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </div>
                <span
                  className={`overflow-hidden whitespace-nowrap text-xs sm:text-sm font-medium tracking-tight transition-all duration-300 ease-out ${isDownloadingCard
                      ? "max-w-[130px] opacity-100 ml-2"
                      : "max-w-0 opacity-0 group-hover:max-w-[130px] group-hover:opacity-100 group-hover:ml-2"
                    }`}
                >
                  {isDownloadingCard ? "Saving card..." : "Download card"}
                </span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 pt-12 pb-16 relative z-10 w-full overflow-hidden max-w-full">
        <div className="flex flex-col items-center justify-center w-full max-w-5xl mx-auto">
          <div className="flex flex-col items-center justify-center relative w-full max-w-[430px]">
            <ReactiveCharacter
              mood={storyStage === "alive" ? selectedMood : "dormant"}
              onMoodChange={(m) => {
                if (storyStage === "alive") {
                  lastUserInteractionRef.current = performance.now();
                  setTimeout(() => setSelectedMood(m), 0);
                }
              }}
              colorTheme="monochrome"
              soundEnabled={soundEnabled}
              interactive={storyStage === "alive"}
              waveIntensity={1.1}
              waveSpeed={1.0}
              waveSurgeEnabled={storyStage === "alive"}
              viewMode={viewMode}
              onViewModeChange={(mode) => setViewMode(mode)}
              affirmationIndex={affirmationIndex}
              onAffirmationChange={(idx) => setAffirmationIndex(idx)}
              cameraActive={cameraEnabled && isReady}
              awakeningProgress={
                storyStage === "dormant"
                  ? 0
                  : storyStage === "awakening"
                    ? awakeningProgress
                    : 1
              }
              breathPhase={activeBreathPhase}
              heartbeatCount={snapshot.heartbeatCount}
              heartbeatAngle={snapshot.heartbeatAngle}
              cameraHeadX={cameraEnabled && isReady ? snapshot.headX : 0}
              cameraHeadY={cameraEnabled && isReady ? snapshot.headY : 0}
              breatheWithMeActive={breatheWithMe}
              calmProgress={calmProgress}
              breatheCoachMessage={
                breatheWithMe ? breatheCoachMessage : idleQuoteMessage
              }
            />

            <AnimatePresence mode="wait">
              {viewMode === "face" && cameraEnabled && !showNewspaperCard && (
                <motion.div
                  key="seamless-bpm-strip"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25 }}
                  className="mt-18 sm:mt-24 w-full max-w-[340px] flex flex-col items-center select-none z-20"
                >
                  <div className="w-full flex items-center justify-between gap-6 px-2">
                    <div className="flex items-baseline shrink-0">
                      <span className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground tabular-nums">
                        {snapshot.facePresent && snapshot.pulseBpm > 0
                          ? breatheWithMe && baselineBpm
                            ? Math.max(
                              58,
                              Math.round(baselineBpm - calmProgress * 7)
                            )
                            : settledBpm !== null
                              ? settledBpm
                              : snapshot.pulseBpm
                          : "--"}
                      </span>
                      <span className="ml-1.5 text-base sm:text-lg font-normal text-foreground/80 tracking-normal">
                        BPM
                      </span>
                    </div>

                    <div
                      className="flex items-center justify-end gap-[3.5px] h-11 flex-1"
                      aria-hidden="true"
                    >
                      {snapshot.pulseTrace.slice(-24).map((val, idx, arr) => {
                        const normPos = idx / Math.max(1, arr.length - 1);
                        const edgeTaper = Math.sin(normPos * Math.PI);
                        const activeAmp = snapshot.facePresent
                          ? Math.min(
                            1,
                            Math.abs(val) * 0.85 +
                            0.22 +
                            Math.sin(idx * 1.7) * 0.15
                          )
                          : 0;
                        const totalHeightPx = snapshot.facePresent
                          ? Math.round(
                            (6 + activeAmp * 32) * (0.35 + edgeTaper * 0.65)
                          )
                          : 4;
                        const isSegmented =
                          snapshot.facePresent &&
                          idx % 5 === 2 &&
                          totalHeightPx > 18;
                        const barOpacity = snapshot.facePresent
                          ? (0.28 + edgeTaper * 0.72).toFixed(2)
                          : "0.18";

                        return isSegmented ? (
                          <div
                            key={idx}
                            className="flex flex-col items-center justify-center gap-[2px]"
                            style={{
                              height: `${totalHeightPx}px`,
                              opacity: barOpacity,
                            }}
                          >
                            <span
                              className="w-[2.5px] flex-1 rounded-full transition-all duration-150"
                              style={{
                                background:
                                  "linear-gradient(180deg, rgba(220,38,38,0.18) 0%, rgba(220,38,38,0.92) 70%, rgba(220,38,38,0.45) 100%)",
                              }}
                            />
                            <span
                              className="w-[2.5px] flex-1 rounded-full transition-all duration-150"
                              style={{
                                background:
                                  "linear-gradient(180deg, rgba(220,38,38,0.45) 0%, rgba(220,38,38,0.92) 30%, rgba(220,38,38,0.18) 100%)",
                              }}
                            />
                          </div>
                        ) : (
                          <span
                            key={idx}
                            className="w-[2.5px] rounded-full transition-all duration-150"
                            style={{
                              height: `${totalHeightPx}px`,
                              opacity: barOpacity,
                              background:
                                "linear-gradient(180deg, rgba(220,38,38,0.12) 0%, rgba(220,38,38,0.95) 50%, rgba(220,38,38,0.12) 100%)",
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-1.5 text-center flex flex-col items-center gap-1">
                    {!snapshot.sdkBridgeConnected ? (
                      <p className="text-[11px] text-rose-600/90 font-medium">
                        {snapshot.sdkError ||
                          "Presage SmartSpectra SDK not connected — add SMARTSPECTRA_API_KEY to .env.local"}
                      </p>
                    ) : !snapshot.facePresent ? (
                      <p className="text-[11px] text-rose-600/90 font-medium">
                        {snapshot.validationHint ||
                          "Step in front of the camera so Mochi can feel your pulse"}
                      </p>
                    ) : snapshot.pulseBpm === 0 ? (
                      <p className="text-[11px] text-muted-foreground">
                        {snapshot.validationHint
                          ? `${snapshot.validationHint} · ${Math.round(awakeningProgress * 100)}%`
                          : `Calibrating live pulse · ${Math.round(awakeningProgress * 100)}%`}
                      </p>
                    ) : storyStage === "awakening" ? (
                      <p className="text-[11px] text-muted-foreground">
                        Waking Mochi with your pulse ·{" "}
                        {Math.round(awakeningProgress * 100)}%
                      </p>
                    ) : breatheWithMe ? null : (
                      <p className="text-[11px] text-muted-foreground">
                        {snapshot.pulseBpm >= 76
                          ? `A little rushed (${snapshot.breathingRateBpm || "--"} br/min) · ready for your daily stillness`
                          : snapshot.pulseBpm <= 68
                            ? `Calm & still · ${snapshot.breathingRateBpm || "--"} br/min`
                            : `Steady rhythm · ${snapshot.breathingRateBpm || "--"} br/min · tap to pause`}
                      </p>
                    )}

                    <div className="inline-flex items-center gap-1.5 text-[10px] font-mono tracking-wide text-muted-foreground/75">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${snapshot.sdkBridgeConnected
                            ? "bg-emerald-500 animate-pulse"
                            : "bg-rose-500"
                          }`}
                      />
                      <span>
                        {snapshot.sdkBridgeConnected
                          ? `Presage SmartSpectra SDK v${snapshot.sdkVersion} · Live${snapshot.hrvRmssd
                            ? ` · HRV ${snapshot.hrvRmssd}ms`
                            : ""
                          }`
                          : "Presage SmartSpectra SDK disconnected (API key required)"}
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
              {breatheWithMe && viewMode === "face" && (
                <motion.div
                  key={pacedBreathLabel}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.35 }}
                  className="mt-2 flex flex-col items-center gap-1 select-none pointer-events-none"
                >
                  <span
                    className="font-caveat text-2xl sm:text-3xl font-bold text-foreground tracking-wide"
                    style={{ fontFamily: "var(--font-caveat), cursive" }}
                  >
                    {pacedBreathLabel}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {storyStage === "alive" &&
                cameraEnabled &&
                viewMode === "face" &&
                !breatheWithMe && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.25 }}
                    className="mt-5 z-20"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSettledBpm(null);
                        setBreatheWithMe(true);
                      }}
                      className="flex items-center gap-2.5 px-7 py-3 rounded-full text-sm font-medium tracking-tight shadow-[0_14px_28px_-6px_rgba(0,0,0,0.32)] hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer bg-[#0a0a0a] hover:bg-[#171717] text-white"
                    >
                      <span>Breathe with me</span>
                    </button>
                  </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
              {showNewspaperCard && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="mt-2 flex flex-col items-center select-none z-20"
                >
                  <div className="text-left max-w-[260px] sm:max-w-[280px]">
                    <p className="text-[19px] sm:text-[22px] font-semibold leading-[1.28] tracking-tight text-[#7f1d1d]">
                      A daily pause for stillness.
                      <br />
                      Turn on camera to begin!
                    </p>
                  </div>

                  <div className="my-2 sm:my-3 pointer-events-none">
                    <svg
                      width="110"
                      height="96"
                      viewBox="0 0 110 96"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="overflow-visible"
                    >
                      <defs>
                        <linearGradient
                          id="arrow-warm-grad"
                          x1="0%"
                          y1="0%"
                          x2="0%"
                          y2="100%"
                        >
                          <stop offset="0%" stopColor="#9a5812" />
                          <stop offset="100%" stopColor="#8a8178" />
                        </linearGradient>
                      </defs>
                      <motion.path
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: 1 }}
                        transition={{ duration: 0.85, ease: "easeInOut", delay: 0.15 }}
                        d="M 88 18 C 52 24, 18 22, 22 9 C 25 -2, 48 6, 54 34 C 58 54, 60 72, 61 88"
                        stroke="url(#arrow-warm-grad)"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <motion.path
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.25, delay: 0.85 }}
                        d="M 46 73 L 61 90 L 75 72"
                        stroke="#8a8178"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowConsentModal(true)}
                    className="min-w-[230px] sm:min-w-[250px] px-9 py-3.5 rounded-full bg-[#0a0a0a] hover:bg-[#171717] text-white text-sm font-medium tracking-tight shadow-[0_14px_28px_-6px_rgba(0,0,0,0.32)] transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                  >
                    Turn on camera
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      <AnimatePresence>
        {showMilestone && milestoneData && (
          <MilestoneCelebration
            streak={milestoneData.streak}
            isNewDayIncrement={milestoneData.isNewDayIncrement}
            totalSessions={milestoneData.totalSessions}
            startBpm={milestoneData.startBpm}
            endBpm={milestoneData.endBpm}
            calmGain={milestoneData.calmGain}
            soundEnabled={soundEnabled}
            onContinue={() => {
              setShowMilestone(false);
              setSelectedMood("calm");
            }}
          />
        )}
      </AnimatePresence>

      <ConsentModal
        isOpen={showConsentModal}
        onClose={() => setShowConsentModal(false)}
        onConsentGiven={() => {
          setShowConsentModal(false);
          handleStartAwakening();
        }}
      />
    </div>
  );
}
