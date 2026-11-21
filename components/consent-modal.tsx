"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ConsentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConsentGiven: () => void;
}

export function ConsentModal({
  isOpen,
  onClose,
  onConsentGiven,
}: ConsentModalProps) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: "Camera consent",
      category: "STEP 1 OF 3",
      visualType: "camera",
      summary: "How Mochi senses you",
      body: "Mochi uses the Presage SmartSpectra SDK and your webcam to sense your pulse (contactless rPPG), breathing rhythm, and facial expressions. Monitoring is 100% consensual, active only while on this screen, and indicated by your camera's hardware light.",
      badge: "CONSENSUAL SENSING",
    },
    {
      title: "Data & privacy",
      category: "STEP 2 OF 3",
      visualType: "privacy",
      summary: "Zero storage. Processed in memory.",
      body: "Video frames are processed locally in real-time memory and immediately discarded. No video, photos, or biometric profiles are recorded, saved to disk, or sent to any server. SDK telemetry is disabled; Presage servers are only contacted for API key authorization.",
      badge: "ZERO VIDEO STORAGE",
    },
    {
      title: "Wellness notice",
      category: "STEP 3 OF 3",
      visualType: "wellness",
      summary: "For general wellness & stillness only",
      body: "Mochi and SmartSpectra SDK metrics are designed for relaxation, mindful stillness, and personal self-reflection. Mochi is not an FDA-cleared medical device and must not be used for diagnosis, medical treatment, or clinical decision-making.",
      badge: "NO MEDICAL CLAIMS",
    },
  ];

  const currentStep = steps[step];

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep((prev) => prev + 1);
    } else {
      onConsentGiven();
      setStep(0);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep((prev) => prev - 1);
    } else {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 select-none">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/45 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: "spring", stiffness: 340, damping: 26 }}
            className="relative w-full max-w-[390px] sm:max-w-[425px] bg-[#ffffff] rounded-[34px] p-6 sm:p-8 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.35)] border border-neutral-100 flex flex-col z-10 overflow-hidden"
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex flex-col">
                <span className="text-[10px] sm:text-[11px] font-mono tracking-widest uppercase font-semibold text-muted-foreground/80 mb-1">
                  {currentStep.category}
                </span>
                <h3 className="font-serif text-[28px] sm:text-[32px] font-normal tracking-tight text-foreground leading-[1.12]">
                  {currentStep.title}
                </h3>
              </div>

              <div className="flex items-center gap-1.5 pt-2">
                {steps.map((_, i) => (
                  <span
                    key={i}
                    className={`h-2 rounded-full transition-all duration-300 ${
                      i === step
                        ? "w-5 bg-amber-400"
                        : "w-2 bg-neutral-200"
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="relative w-full h-44 sm:h-48 rounded-2xl bg-gradient-to-b from-[#fef7eb] via-[#fff3e0] to-[#fef0ea] border border-amber-200/50 flex flex-col items-center justify-center p-4 overflow-hidden mb-5">
              <div
                className="absolute inset-0 pointer-events-none opacity-60"
                style={{
                  background:
                    "radial-gradient(circle at 50% 40%, rgba(251,191,36,0.35) 0%, rgba(254,205,211,0.2) 60%, transparent 100%)",
                }}
              />

              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, scale: 0.85, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.85, y: -8 }}
                  transition={{ duration: 0.28 }}
                  className="relative z-10 flex flex-col items-center justify-center"
                >
                  {step === 0 && (
                    <div className="flex flex-col items-center">
                      <div className="relative w-16 h-16 rounded-full bg-white/90 shadow-md flex items-center justify-center border border-amber-100">
                        <svg
                          className="w-8 h-8 text-neutral-800"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                          <circle cx="12" cy="13" r="3" />
                        </svg>
                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-white animate-pulse" />
                      </div>
                    </div>
                  )}

                  {step === 1 && (
                    <div className="flex flex-col items-center">
                      <div className="relative w-16 h-16 rounded-full bg-white/90 shadow-md flex items-center justify-center border border-amber-100">
                        <svg
                          className="w-8 h-8 text-neutral-800"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white" />
                      </div>
                    </div>
                  )}

                  {step === 2 && (
                    <div className="flex flex-col items-center">
                      <div className="relative w-16 h-16 rounded-full bg-white/90 shadow-md flex items-center justify-center border border-amber-100">
                        <svg
                          className="w-8 h-8 text-neutral-800"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                        </svg>
                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-rose-400 border-2 border-white" />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-3 opacity-80">
                    <span className="w-2.5 h-2.5 rounded-full bg-neutral-900" />
                    <span className="w-2.5 h-2.5 rounded-full bg-neutral-900" />
                    <span className="w-2.5 h-2.5 rounded-full bg-neutral-900" />
                  </div>
                </motion.div>
              </AnimatePresence>

              <span className="absolute bottom-2.5 text-[10px] font-mono uppercase tracking-widest text-neutral-500 font-semibold">
                {currentStep.badge}
              </span>
            </div>

            <div className="min-h-[110px] sm:min-h-[120px] flex flex-col justify-start mb-6">
              <h4 className="text-sm sm:text-base font-semibold tracking-tight text-foreground mb-1">
                {currentStep.summary}
              </h4>
              <p className="text-xs sm:text-[13px] text-muted-foreground leading-relaxed">
                {currentStep.body}
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handleBack}
                className="px-4 py-3 rounded-full text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                {step === 0 ? "Cancel" : "Back"}
              </button>

              <button
                type="button"
                onClick={handleNext}
                className="flex-1 py-3.5 px-6 rounded-full font-medium text-xs sm:text-sm tracking-tight bg-[#0a0a0a] hover:bg-[#1a1a1a] active:scale-[0.98] text-white shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>
                  {step === steps.length - 1
                    ? "I understand & enable camera"
                    : "Continue"}
                </span>
                {step < steps.length - 1 && (
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
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
