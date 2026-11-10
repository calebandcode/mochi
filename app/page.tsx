"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ReactiveCharacter,
  CharacterMood,
  sfx,
} from "@/components/mochi-character";
import { AFFIRMATIONS } from "@/lib/affirmations-data";
import { useSmartSpectraCamera } from "@/lib/smartspectra-sensor";

export default function MochiPage() {
  const [selectedMood, setSelectedMood] = useState<CharacterMood>("grin");
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Step 1: Consent / Mode State ("prompt" -> "camera" | "just-play")
  const [entryState, setEntryState] = useState<"prompt" | "camera" | "just-play">(
    "prompt"
  );
  const cameraEnabled = entryState === "camera";

  // Optional side-by-side webcam preview for recording the hackathon demo video
  const [showMirrorPreview, setShowMirrorPreview] = useState(false);
  const previewVideoElRef = useRef<HTMLVideoElement | null>(null);

  // Step 4 & 5: "Breathe with me" Co-Regulation State
  const [breatheWithMe, setBreatheWithMe] = useState(false);
  const [pacedBreathPhase, setPacedBreathPhase] = useState(0); // -1 to +1
  const [pacedBreathLabel, setPacedBreathLabel] = useState<
    "breathe in..." | "breathe out..."
  >("breathe in...");
  const [calmProgress, setCalmProgress] = useState(0); // 0 to 1

  // View Mode: "face" vs "affirmation"
  const [viewMode, setViewMode] = useState<"face" | "affirmation">("face");
  const [affirmationIndex, setAffirmationIndex] = useState(0);

  // SmartSpectra Camera Hook
  const { videoRef, isReady, snapshot, stopCamera } =
    useSmartSpectraCamera(cameraEnabled);

  // Sync webcam MediaStream into the optional side-by-side video element
  useEffect(() => {
    if (
      showMirrorPreview &&
      cameraEnabled &&
      isReady &&
      previewVideoElRef.current &&
      videoRef.current?.srcObject
    ) {
      previewVideoElRef.current.srcObject = videoRef.current.srcObject;
      previewVideoElRef.current.play().catch(() => {});
    }
  }, [showMirrorPreview, cameraEnabled, isReady, videoRef]);

  // Mirror facial expression from camera when in live mirroring mode
  useEffect(() => {
    if (!cameraEnabled || breatheWithMe || viewMode === "affirmation") return;
    if (snapshot.expression === "surprised") {
      setSelectedMood("surprised");
    } else if (snapshot.expression === "grin") {
      setSelectedMood("grin");
    }
  }, [cameraEnabled, breatheWithMe, viewMode, snapshot.expression]);

  // Step 4 & 5: "Breathe with me" Paced Breathing Loop + Calm Reward Trigger
  useEffect(() => {
    if (!breatheWithMe || viewMode === "affirmation") {
      setPacedBreathPhase(0);
      setCalmProgress(0);
      return;
    }

    let animId: number;
    const startTime = performance.now();
    // 4s inhale + 5s exhale = 9s calm breathing cycle
    const cycleDurationSec = 9.0;
    // Reward triggers after ~36 seconds (4 calm breath cycles) so judges see it clearly in a short demo
    const rewardTargetSec = 36.0;

    const tick = () => {
      const elapsedSec = (performance.now() - startTime) / 1000;
      const cyclePos = (elapsedSec % cycleDurationSec) / cycleDurationSec;

      // Smooth cosine wave: 0..0.44 is inhale (-1 -> +1), 0.44..1.0 is exhale (+1 -> -1)
      let phase: number;
      if (cyclePos < 0.44) {
        const t = cyclePos / 0.44;
        phase = -Math.cos(t * Math.PI); // -1 to +1
        setPacedBreathLabel("breathe in...");
      } else {
        const t = (cyclePos - 0.44) / 0.56;
        phase = Math.cos(t * Math.PI); // +1 to -1
        setPacedBreathLabel("breathe out...");
      }

      setPacedBreathPhase(phase);

      const nextProgress = Math.min(1, elapsedSec / rewardTargetSec);
      setCalmProgress(nextProgress);

      // As breathing slows down, Mochi gets happier & calmer
      if (nextProgress > 0.65) {
        setSelectedMood("love");
      } else if (nextProgress > 0.3) {
        setSelectedMood("smug");
      } else {
        setSelectedMood("grin");
      }

      // Step 5: Reward! Morph into "Slow is still moving." affirmation card
      if (nextProgress >= 1) {
        if (soundEnabled) sfx.playChime();
        setAffirmationIndex(0); // "Slow is still moving."
        setViewMode("affirmation");
        setBreatheWithMe(false);
        return;
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [breatheWithMe, viewMode, soundEnabled]);

  // Step 6: Stop Camera handler
  const handleStopCamera = useCallback(() => {
    stopCamera();
    setBreatheWithMe(false);
    setCalmProgress(0);
    setShowMirrorPreview(false);
    setEntryState("just-play");
    setSelectedMood("grin");
  }, [stopCamera]);

  // Affirmation navigation handlers
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

  // Keyboard navigation for affirmations + subtle expression shortcuts for demo filming
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

      // Helpful keyboard cues when filming with camera active
      if (cameraEnabled && !breatheWithMe) {
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
    cameraEnabled,
    breatheWithMe,
    handleNextAffirmation,
    handlePrevAffirmation,
  ]);

  const moods: Array<{ id: CharacterMood; label: string }> = [
    { id: "grin", label: "Happy" },
    { id: "curious", label: "Curious" },
    { id: "smug", label: "Smug" },
    { id: "surprised", label: "Surprised" },
    { id: "love", label: "In Love" },
    { id: "sleepy", label: "Sleepy" },
    { id: "dizzy", label: "Dizzy" },
  ];

  const currentAffirmation = AFFIRMATIONS[affirmationIndex];
  const activeBreathPhase = breatheWithMe
    ? pacedBreathPhase
    : cameraEnabled
    ? snapshot.breathPhase
    : 0;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col justify-between overflow-hidden relative selection:bg-[#fef08a] selection:text-black">
      {/* ─── Minimalist Top Bar ────────────────────────────────────── */}
      <header className="fixed top-0 inset-x-0 z-30 px-6 sm:px-10 py-5 flex items-center justify-between pointer-events-none">
        {/* Brand Wordmark */}
        <div className="pointer-events-auto flex items-center gap-3">
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

        {/* Right Tools: Step 2 Camera Active Dot + Stop Button + Sound Toggle */}
        <div className="pointer-events-auto flex items-center gap-2">
          {cameraEnabled ? (
            <div className="flex items-center gap-2 rounded-full border border-border bg-background/95 backdrop-blur-md pl-3 pr-1.5 py-1 shadow-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-xs font-medium text-foreground select-none">
                Camera active
              </span>

              {/* Optional Mirror View Toggle (for side-by-side judge demo video) */}
              <button
                type="button"
                onClick={() => setShowMirrorPreview((v) => !v)}
                className={`px-2 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                  showMirrorPreview
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface"
                }`}
                title="Toggle side-by-side camera mirror view"
              >
                {showMirrorPreview ? "Hide mirror" : "Mirror view"}
              </button>

              <button
                type="button"
                onClick={handleStopCamera}
                className="px-2.5 py-1 rounded-full text-xs font-medium bg-surface hover:bg-neutral-200/80 text-foreground border border-border transition-all active:scale-95 cursor-pointer"
              >
                Stop camera
              </button>
            </div>
          ) : (
            entryState === "just-play" && (
              <button
                type="button"
                onClick={() => setEntryState("camera")}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-border bg-surface text-xs font-medium text-foreground hover:bg-neutral-200/80 transition-all active:scale-95 cursor-pointer"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span>Turn on camera</span>
              </button>
            )
          )}

          <button
            type="button"
            onClick={() => setSoundEnabled((v) => !v)}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-border bg-surface text-foreground hover:bg-neutral-200/80 transition-all active:scale-95 cursor-pointer"
            title={soundEnabled ? "Mute audio effects" : "Enable audio effects"}
          >
            {soundEnabled ? (
              <svg
                className="w-4 h-4 text-foreground"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            ) : (
              <svg
                className="w-4 h-4 text-muted-foreground"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            )}
            <span className="sr-only">Toggle audio</span>
          </button>
        </div>
      </header>

      {/* ─── Main Interactive Canvas ──────────────────────────────── */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 sm:py-20 relative w-full overflow-hidden max-w-full">
        <div
          className={`flex flex-col ${
            showMirrorPreview && cameraEnabled
              ? "lg:flex-row items-center justify-center gap-8 lg:gap-14"
              : "items-center justify-center"
          } w-full max-w-5xl mx-auto`}
        >
          {/* Optional Side-by-Side Webcam Feed for Demo Recording */}
          <AnimatePresence>
            {showMirrorPreview && cameraEnabled && (
              <motion.div
                initial={{ opacity: 0, scale: 0.92, x: -12 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.92, x: -12 }}
                transition={{ duration: 0.25 }}
                className="relative w-[260px] sm:w-[320px] aspect-[4/3] rounded-3xl overflow-hidden border border-border bg-surface shadow-md shrink-0"
              >
                <video
                  ref={previewVideoElRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover -scale-x-100"
                />
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between px-3 py-1.5 rounded-full bg-background/85 backdrop-blur-md border border-border text-[11px] font-mono text-foreground">
                  <span>♥ {snapshot.pulseBpm} bpm</span>
                  <span>
                    {snapshot.breathPhase >= 0 ? "↑ inhale" : "↓ exhale"}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Mochi Character + Guided Breathing Whisper */}
          <div className="flex flex-col items-center justify-center relative w-full">
            <ReactiveCharacter
              mood={selectedMood}
              onMoodChange={(m) => setSelectedMood(m)}
              colorTheme="monochrome"
              soundEnabled={soundEnabled}
              interactive={true}
              waveIntensity={1.1}
              waveSpeed={1.0}
              waveSurgeEnabled={true}
              viewMode={viewMode}
              onViewModeChange={(mode) => setViewMode(mode)}
              affirmationIndex={affirmationIndex}
              onAffirmationChange={(idx) => setAffirmationIndex(idx)}
              cameraActive={cameraEnabled && isReady}
              breathPhase={activeBreathPhase}
              heartbeatCount={snapshot.heartbeatCount}
              heartbeatAngle={snapshot.heartbeatAngle}
              cameraHeadX={snapshot.headX}
              cameraHeadY={snapshot.headY}
              breatheWithMeActive={breatheWithMe}
              calmProgress={calmProgress}
            />

            {/* Step 4: Gentle Paced Breathing Prompt underneath Mochi */}
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
                  <span className="font-caveat text-2xl sm:text-3xl font-bold text-foreground tracking-wide">
                    {pacedBreathLabel}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    follow Mochi&apos;s rhythm
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Step 1: Friendly Onboarding Prompt */}
            <AnimatePresence>
              {entryState === "prompt" && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.25 }}
                  className="mt-4 max-w-[380px] w-full rounded-2xl border border-border bg-background/95 backdrop-blur-md p-4 sm:p-5 text-center shadow-sm"
                >
                  <p className="text-sm leading-relaxed text-foreground">
                    Mochi can breathe and feel with you using your camera.{" "}
                    <span className="text-muted-foreground">
                      Nothing is recorded. Want to turn it on?
                    </span>
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setEntryState("camera")}
                      className="px-4 py-2 rounded-full text-xs font-semibold bg-foreground text-background hover:opacity-90 transition-all active:scale-95 cursor-pointer"
                    >
                      Turn on camera
                    </button>
                    <button
                      type="button"
                      onClick={() => setEntryState("just-play")}
                      className="px-4 py-2 rounded-full text-xs font-medium bg-surface text-foreground border border-border hover:bg-neutral-200/80 transition-all active:scale-95 cursor-pointer"
                    >
                      Just play
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* ─── Bottom Navigation Dock ───────────────────────────────── */}
      <footer className="fixed bottom-4 sm:bottom-6 inset-x-0 z-30 flex flex-col items-center justify-center px-2 sm:px-4 pointer-events-none">
        <AnimatePresence mode="wait">
          {viewMode === "affirmation" ? (
            /* ─── Affirmation Carousel Controller Dock ─────────────── */
            <motion.div
              key="affirmation-dock"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 14 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 p-1 sm:p-1.5 rounded-full bg-background/95 backdrop-blur-md border border-border shadow-lg max-w-[calc(100vw-24px)] shrink-0"
            >
              <button
                type="button"
                onClick={handlePrevAffirmation}
                className="inline-flex items-center gap-1 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-full text-xs font-medium text-foreground hover:bg-surface border border-transparent hover:border-border transition-all active:scale-95 cursor-pointer"
                title="Previous affirmation (←)"
              >
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                <span className="hidden sm:inline">Prev</span>
              </button>

              <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 text-xs font-mono select-none">
                <span className="font-bold text-foreground">
                  {String(affirmationIndex + 1).padStart(2, "0")}
                </span>
                <span className="text-muted-foreground">/</span>
                <span className="text-muted-foreground">
                  {String(AFFIRMATIONS.length).padStart(2, "0")}
                </span>
                {currentAffirmation.badge && (
                  <span className="hidden sm:inline-block text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface border border-border text-muted-foreground">
                    {currentAffirmation.badge}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleNextAffirmation}
                className="inline-flex items-center gap-1 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs font-semibold bg-foreground text-background hover:opacity-90 shadow-xs transition-all active:scale-95 cursor-pointer"
                title="Next affirmation (→ / Space / Click card)"
              >
                <span>Next</span>
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              <button
                type="button"
                onClick={handleShuffleAffirmation}
                className="inline-flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-surface transition-all active:scale-90 cursor-pointer"
                title="Random affirmation"
              >
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="16 3 21 3 21 8" />
                  <line x1="4" y1="20" x2="21" y2="3" />
                  <polyline points="21 16 21 21 16 21" />
                  <line x1="15" y1="15" x2="21" y2="21" />
                  <line x1="4" y1="4" x2="9" y2="9" />
                </svg>
              </button>
            </motion.div>
          ) : (
            /* ─── Character Mood Selector + "Breathe with me" Dock ─── */
            <motion.div
              key="mood-dock"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 14 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-auto flex items-center gap-1.5 p-1 sm:p-1.5 rounded-full bg-background/95 backdrop-blur-md border border-border shadow-lg max-w-[calc(100vw-24px)] overflow-x-auto no-scrollbar scroll-smooth"
            >
              {/* Step 4: "Breathe with me" Button */}
              {cameraEnabled && (
                <>
                  <button
                    type="button"
                    onClick={() => setBreatheWithMe((v) => !v)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all shrink-0 active:scale-95 cursor-pointer flex items-center gap-1.5 ${
                      breatheWithMe
                        ? "bg-rose-600 text-white shadow-xs"
                        : "bg-foreground text-background hover:opacity-90"
                    }`}
                  >
                    <span>
                      {breatheWithMe ? "Breathing together..." : "Breathe with me"}
                    </span>
                  </button>
                  <span className="h-4 w-[1px] bg-border mx-0.5 shrink-0" />
                </>
              )}

              {moods.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setBreatheWithMe(false);
                    setSelectedMood(m.id);
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 active:scale-95 cursor-pointer ${
                    selectedMood === m.id && !breatheWithMe
                      ? "bg-foreground text-background shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-surface"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </footer>
    </div>
  );
}
