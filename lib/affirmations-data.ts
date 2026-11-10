export interface Affirmation {
  id: string;
  badge?: string;
  lines: string[];
  highlight?: {
    text: string;
    style: "oval" | "underline" | "sparkles";
  };
  particles?: "raindrops" | "sparkles" | "none";
  fontStyle?: "handwriting" | "serif-italic" | "cursive" | "all-caps-mono";
  cardType?: "speech-bubble" | "notification" | "brushstroke" | "slate-quote";
  watermark?: string;
  author?: string;
  theme: {
    bg: string;
    text: string;
    badgeText?: string;
    border: string;
    glow: string;
    accent: string;
    isLightBg?: boolean;
  };
}

export const AFFIRMATIONS: Affirmation[] = [
  // 0. Calm Breathing Reward Card: "Slow is still moving."
  {
    id: "slow-is-still-moving",
    badge: "BREATHE",
    lines: [
      "You slowed down.",
      "Slow is still moving.",
    ],
    highlight: {
      text: "Slow is still moving.",
      style: "oval",
    },
    fontStyle: "handwriting",
    theme: {
      bg: "#5a846c",
      text: "#ffffff",
      badgeText: "#ffffff",
      border: "#4b715b",
      glow: "rgba(90,132,108,0.38)",
      accent: "#ffffff",
    },
  },

  // 1. "If flowers bloom so can you" (iOS Notification + Flower Line Art)
  {
    id: "flowers-bloom-reminder",
    lines: ["If flowers bloom so can you"],
    cardType: "notification",
    fontStyle: "serif-italic",
    badge: "REMINDER",
    theme: {
      bg: "#a092c6",
      text: "#2c2242",
      badgeText: "#64508a",
      border: "#8879b1",
      glow: "rgba(160,146,198,0.4)",
      accent: "#ffffff",
    },
  },

  // 2. "chase your dreams... Rolla ♡" (Acrylic Brushstroke Calligraphy)
  {
    id: "chase-dreams-rolla",
    lines: [
      "chase your dreams.",
      "you are already living your",
      "dream, live it to the",
      "fullest and most",
      "beautiful way.",
    ],
    cardType: "brushstroke",
    fontStyle: "cursive",
    author: "Rolla ♡",
    theme: {
      bg: "#f3f6fa",
      text: "#0c3b6d",
      border: "#cfdfef",
      glow: "rgba(184,223,251,0.45)",
      accent: "#0c3b6d",
      isLightBg: true,
    },
  },

  // 3. "WHAT IS MEANT TO BE WILL ALWAYS FIND ITS WAY. ALWAYS." (Slate Minimalist)
  {
    id: "meant-to-be-always",
    lines: [
      "WHAT IS MEANT TO BE",
      "WILL ALWAYS FIND ITS WAY.",
      "ALWAYS.",
    ],
    cardType: "slate-quote",
    fontStyle: "all-caps-mono",
    author: "— unknown",
    theme: {
      bg: "#4e5971",
      text: "#ffffff",
      border: "#3d475c",
      glow: "rgba(78,89,113,0.4)",
      accent: "#ffffff",
    },
  },

  // 4. "May the universe always send us kindness..." (Sky Speech Bubble)
  {
    id: "universe-send-kindness",
    badge: "POSITIVE",
    lines: [
      "May the universe always",
      "send us kindness — and",
      "may we send it back.",
    ],
    cardType: "speech-bubble",
    fontStyle: "handwriting",
    theme: {
      bg: "#6093c4",
      text: "#ffffff",
      badgeText: "#ffffff",
      border: "#4c7ea9",
      glow: "rgba(96,147,196,0.4)",
      accent: "#ffffff",
    },
  },

  // 5. "To heal, you need to stop going back." (Serif Italic Mulberry Violet)
  {
    id: "to-heal",
    lines: ["To heal,", "you need to stop going back."],
    fontStyle: "serif-italic",
    watermark: "@kindlyanimated",
    theme: {
      bg: "#845999",
      text: "#ffffff",
      border: "#704584",
      glow: "rgba(132,89,153,0.35)",
      accent: "#ffffff",
    },
  },

  // 6. "Good days will surely come, just wait." (Lilac Pastel Lavender)
  {
    id: "good-days-surely",
    badge: "POSITIVE",
    lines: ["Good days will surely", "come, just wait."],
    fontStyle: "handwriting",
    theme: {
      bg: "#a18deb",
      text: "#ffffff",
      badgeText: "#ffffff",
      border: "#8c75e2",
      glow: "rgba(161,141,235,0.35)",
      accent: "#ffffff",
    },
  },

  // 7. Raindrops & 'This too shall pass'
  {
    id: "this-too-shall-pass",
    lines: ["'This too", "shall pass'"],
    particles: "raindrops",
    fontStyle: "handwriting",
    theme: {
      bg: "#fbf8f5",
      text: "#1e293b",
      badgeText: "#64748b",
      border: "#e2dcd5",
      glow: "rgba(148,163,184,0.25)",
      accent: "#7dd3fc",
      isLightBg: true,
    },
  },

  // 8. Seafoam Sage Green
  {
    id: "darkest-moments-light",
    badge: "POSITIVE",
    lines: [
      "Even the darkest moments",
      "can hold light, if u choose",
      "to look from a diffrent angle.",
    ],
    fontStyle: "handwriting",
    theme: {
      bg: "#6ca590",
      text: "#ffffff",
      badgeText: "#ffffff",
      border: "#57907b",
      glow: "rgba(108,165,144,0.35)",
      accent: "#ffffff",
    },
  },

  // 9. Royal Purple with Circled Oval
  {
    id: "wonder-why-sincere",
    badge: "POSITIVE",
    lines: [
      "The more we wonder why,",
      "the less we find the",
      "answer. The answer comes",
      "when we're sincere.",
    ],
    highlight: {
      text: "when we're sincere.",
      style: "oval",
    },
    fontStyle: "handwriting",
    theme: {
      bg: "#723d9a",
      text: "#ffffff",
      badgeText: "#ffffff",
      border: "#5e2e83",
      glow: "rgba(114,61,154,0.35)",
      accent: "#ffffff",
    },
  },

  // 10. Electric Indigo Cobalt
  {
    id: "growth-daily-effort",
    badge: "POSITIVE",
    lines: [
      "Growth comes from daily",
      "effort. Start with little",
      "steps. Do. Learn. Grow.",
    ],
    fontStyle: "handwriting",
    theme: {
      bg: "#3c2fd2",
      text: "#ffffff",
      badgeText: "#ffffff",
      border: "#2f22b8",
      glow: "rgba(60,47,210,0.35)",
      accent: "#ffffff",
    },
  },

  // 11. Aegean Slate Blue with Circled Oval
  {
    id: "just-let-them",
    badge: "POSITIVE",
    lines: [
      "let them have their wins,",
      "their ways, their choices.",
      "Just let them.",
    ],
    highlight: {
      text: "Just let them.",
      style: "oval",
    },
    fontStyle: "handwriting",
    theme: {
      bg: "#22598c",
      text: "#ffffff",
      badgeText: "#ffffff",
      border: "#184670",
      glow: "rgba(34,89,140,0.35)",
      accent: "#ffffff",
    },
  },

  // 12. Periwinkle Blue
  {
    id: "goodness-reward",
    badge: "POSITIVE",
    lines: [
      "Goodness is its own",
      "reward, and kindness",
      "is its shadow.",
    ],
    fontStyle: "handwriting",
    theme: {
      bg: "#819cf7",
      text: "#ffffff",
      badgeText: "#ffffff",
      border: "#6b8bf5",
      glow: "rgba(129,156,247,0.35)",
      accent: "#ffffff",
    },
  },

  // 13. Dusty Rose with Underline
  {
    id: "we-are-creators",
    badge: "POSITIVE",
    lines: [
      "Take your time—",
      "we are not competitors",
      "we are creators.",
    ],
    highlight: {
      text: "we are creators.",
      style: "underline",
    },
    fontStyle: "handwriting",
    theme: {
      bg: "#c46d8f",
      text: "#ffffff",
      badgeText: "#ffffff",
      border: "#b3597d",
      glow: "rgba(196,109,143,0.35)",
      accent: "#ffffff",
    },
  },

  // 14. Deep Slate Blue with Circled Oval
  {
    id: "live-today",
    badge: "POSITIVE",
    lines: [
      "what's gone is done",
      "live today and",
      "do your best.",
    ],
    highlight: {
      text: "do your best.",
      style: "oval",
    },
    fontStyle: "handwriting",
    theme: {
      bg: "#24588e",
      text: "#ffffff",
      badgeText: "#ffffff",
      border: "#1a4674",
      glow: "rgba(36,88,142,0.35)",
      accent: "#ffffff",
    },
  },

  // 15. Warm Terracotta
  {
    id: "small-progress",
    badge: "GROWTH",
    lines: [
      "Small daily progress",
      "adds up to big change.",
      "Keep going.",
    ],
    highlight: {
      text: "Keep going.",
      style: "oval",
    },
    fontStyle: "handwriting",
    theme: {
      bg: "#d97853",
      text: "#ffffff",
      badgeText: "#ffffff",
      border: "#c56743",
      glow: "rgba(217,120,83,0.35)",
      accent: "#ffffff",
    },
  },

  // 16. Sage Matcha Calm
  {
    id: "gentle-self",
    badge: "MINDFUL",
    lines: [
      "Be gentle with yourself,",
      "you are doing the best",
      "you can today.",
    ],
    highlight: {
      text: "gentle with yourself,",
      style: "underline",
    },
    fontStyle: "handwriting",
    theme: {
      bg: "#5a846c",
      text: "#ffffff",
      badgeText: "#ffffff",
      border: "#4b715b",
      glow: "rgba(90,132,108,0.35)",
      accent: "#ffffff",
    },
  },
];

