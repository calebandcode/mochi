"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ReactiveCharacter, sfx } from "@/components/mochi-character";

interface MilestoneCelebrationProps {
  streak: number;
  isNewDayIncrement?: boolean;
  totalSessions?: number;
  startBpm?: number;
  endBpm?: number;
  calmGain?: number;
  onContinue: () => void;
  soundEnabled?: boolean;
}

export function MilestoneCelebration({
  streak,
  isNewDayIncrement = true,
  onContinue,
  soundEnabled = true,
}: MilestoneCelebrationProps) {
  const [displayNumber, setDisplayNumber] = useState(0);

  useEffect(() => {
    if (soundEnabled) {
      sfx.playChime();
    }
  }, [soundEnabled]);

  useEffect(() => {
    const target = Math.max(1, streak);
    const duration = 900;
    const startTime = performance.now();

    const animateNumber = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayNumber(Math.round(eased * target));

      if (progress < 1) {
        requestAnimationFrame(animateNumber);
      }
    };

    const animId = requestAnimationFrame(animateNumber);
    return () => cancelAnimationFrame(animId);
  }, [streak]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-between p-6 sm:p-10 bg-background/98 backdrop-blur-md select-none overflow-y-auto"
    >
      <div className="w-full flex justify-end">
        <button
          type="button"
          onClick={onContinue}
          className="text-muted-foreground/60 hover:text-foreground text-sm font-mono tracking-wider transition-colors p-2 cursor-pointer"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-col items-center justify-center my-auto w-full max-w-sm">
        <motion.div
          initial={{ scale: 0.65, y: 24, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          transition={{
            type: "spring",
            stiffness: 260,
            damping: 20,
            delay: 0.08,
          }}
          className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center"
        >
          <motion.div
            animate={{
              scale: [0.94, 1.08, 0.94],
              opacity: [0.65, 0.88, 0.65],
            }}
            transition={{
              repeat: Infinity,
              duration: 3.8,
              ease: "easeInOut",
            }}
            className="absolute -inset-10 sm:-inset-14 rounded-full pointer-events-none -z-10"
            style={{
              background:
                "radial-gradient(circle, rgba(251,191,36,0.38) 0%, rgba(249,115,22,0.2) 42%, rgba(244,63,94,0.06) 68%, transparent 100%)",
              filter: "blur(28px)",
            }}
          />

          <motion.div
            animate={{
              y: [-4, 4, -4],
              scaleY: [0.98, 1.04, 0.98],
              rotate: [-1.2, 1.2, -1.2],
            }}
            transition={{
              repeat: Infinity,
              duration: 3.4,
              ease: "easeInOut",
            }}
            className="absolute -inset-6 sm:-inset-8 pointer-events-none -z-10 flex items-center justify-center"
          >
            <svg
              viewBox="0 0 320 340"
              className="w-full h-full overflow-visible"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="soft-flame-ambient" x1="50%" y1="0%" x2="50%" y2="100%">
                  <stop offset="0%" stopColor="#fef08a" stopOpacity="0.85" />
                  <stop offset="35%" stopColor="#fde047" stopOpacity="0.75" />
                  <stop offset="70%" stopColor="#fb923c" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.12" />
                </linearGradient>

                <filter id="flame-ambient-blur" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="12" />
                </filter>
              </defs>

              <path
                d="M 160 18 C 235 18, 275 65, 270 145 C 265 195, 225 240, 195 285 C 175 315, 162 332, 155 335 C 145 332, 130 305, 115 270 C 85 205, 55 145, 60 95 C 65 45, 105 18, 160 18 Z"
                fill="url(#soft-flame-ambient)"
                filter="url(#flame-ambient-blur)"
              />
            </svg>
          </motion.div>

          <div className="absolute inset-0 pointer-events-none -z-10 overflow-visible">
            <motion.div
              animate={{ y: [-4, 4, -4], opacity: [0.5, 0.95, 0.5] }}
              transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
              className="absolute top-2 right-4 w-2 h-3 rounded-full bg-amber-400/80 blur-[0.5px] rotate-12"
            />
            <motion.div
              animate={{ y: [-5, 3, -5], opacity: [0.4, 0.9, 0.4] }}
              transition={{ repeat: Infinity, duration: 2.8, delay: 0.3, ease: "easeInOut" }}
              className="absolute top-10 -right-2 w-1.5 h-3.5 rounded-full bg-yellow-400/85 blur-[0.5px] rotate-24"
            />
            <motion.div
              animate={{ y: [-3, 5, -3], opacity: [0.35, 0.8, 0.35] }}
              transition={{ repeat: Infinity, duration: 2.5, delay: 0.6, ease: "easeInOut" }}
              className="absolute top-24 -right-4 w-2 h-2.5 rounded-full bg-orange-400/75 blur-[0.5px]"
            />

            <motion.div
              animate={{ y: [-2, 4, -2], opacity: [0.3, 0.75, 0.3] }}
              transition={{ repeat: Infinity, duration: 2.0, delay: 0.8, ease: "easeInOut" }}
              className="absolute bottom-2 right-10 w-2 h-2 rounded-full bg-amber-500/70"
            />
            <motion.div
              animate={{ y: [-3, 3, -3], opacity: [0.4, 0.85, 0.4] }}
              transition={{ repeat: Infinity, duration: 2.4, delay: 0.2, ease: "easeInOut" }}
              className="absolute bottom-6 left-12 w-1.5 h-2 rounded-full bg-yellow-500/75"
            />

            <motion.div
              animate={{ y: [-4, 3, -4], opacity: [0.3, 0.8, 0.3] }}
              transition={{ repeat: Infinity, duration: 2.7, delay: 0.5, ease: "easeInOut" }}
              className="absolute top-14 -left-2 w-2 h-2.5 rounded-full bg-amber-400/70 -rotate-12"
            />
          </div>

          <motion.div
            animate={{
              y: [-4, 4, -4],
            }}
            transition={{
              repeat: Infinity,
              duration: 3.4,
              ease: "easeInOut",
            }}
            className="w-[210px] h-[180px] sm:w-[240px] sm:h-[206px] flex items-center justify-center relative select-none pointer-events-none"
          >
            <ReactiveCharacter
              mood="grin"
              colorTheme="monochrome"
              interactive={false}
              soundEnabled={false}
              waveIntensity={0.65}
              waveSpeed={0.8}
            />
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ scale: 0.8, y: 20, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          transition={{ duration: 0.45, delay: 0.22, ease: "easeOut" }}
          className="mt-4 sm:mt-6 text-center select-none"
        >
          <div className="text-[96px] sm:text-[124px] font-black tracking-tight leading-none text-[#d1d5db] drop-shadow-xs font-sans">
            {displayNumber}
          </div>

          <div className="mt-1 flex items-center justify-center gap-2">
            <span className="text-xs sm:text-sm font-mono font-bold uppercase tracking-[0.22em] text-muted-foreground">
              {isNewDayIncrement ? "Stillness Streak" : "Streak Maintained"}
            </span>
          </div>

          <p
            className="mt-4 text-lg sm:text-xl font-bold text-foreground/90 font-caveat tracking-wide"
            style={{ fontFamily: "var(--font-caveat), cursive" }}
          >
            {isNewDayIncrement
              ? "You showed up for your stillness today."
              : "Another peaceful pause today."}
          </p>
        </motion.div>
      </div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.3 }}
        className="w-full max-w-xs mt-6 mb-2"
      >
        <button
          type="button"
          onClick={onContinue}
          className="w-full py-3.5 px-6 rounded-full font-medium text-sm sm:text-base tracking-tight bg-[#0a0a0a] hover:bg-[#1f1f1f] active:scale-[0.98] text-white shadow-[0_12px_24px_-6px_rgba(0,0,0,0.35)] transition-all cursor-pointer flex items-center justify-center gap-2"
        >
          <span>Continue</span>
        </button>
      </motion.div>
    </motion.div>
  );
}
