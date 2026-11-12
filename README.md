# Mochi (mochi.) — The Living Squircle Companion

> **A contactless, bio-responsive web companion for daily stillness and nervous-system co-regulation, powered by the Presage SmartSpectra SDK.**

Built for the **[Presage SmartSpectra SDK Challenge](https://dev.to/challenges/presage-2026-11-04)** on DEV.to.

---

## 🌟 Overview

**Mochi** is a living, bio-responsive web companion (zero install required) that uses your webcam to sense your **heartbeat (rPPG pulse)**, **breathing cadence**, **facial expressions**, and **head position** in real time—without wearables or sensors.

Instead of cold medical charts or clinical graphs, Mochi translates human vitals into warm, playful co-regulation:
- **Awakening by Heartbeat**: Mochi starts dormant. When you turn on your camera, two ambient blood-flow streams meet as your resting pulse is calibrated, waking Mochi up.
- **5–3–8 Restorative Breathing**: Co-regulates your nervous system via parasympathetic vagal stimulation (5s inhale, 3s hold, 8s prolonged exhale).
- **Face & Gaze Following**: Mochi’s eyes and soft squircle body lean and follow your face as you move naturally in front of your desk.
- **Stillness Streaks & Celebrations**: Rewards regular mindful pauses with calendar-day stillness streak tracking and ambient milestone screens.
- **Curated Affirmation & Quote Cards**: Double-click Mochi or tap to flip into high-resolution exportable affirmation cards rendered in signature Caveat typography.

---

## 🔬 How It Uses Presage SmartSpectra SDK Signals

Mochi integrates `@smartspectra/node-sdk` (v3.5.0) via an SSE telemetry bridge at `/api/smartspectra/stream` combined with an in-browser real-time optical rPPG pipeline:

| Presage Signal | How Mochi Responds in Real Time |
| :--- | :--- |
| **Pulse (rPPG Heartbeat BPM)** | Drives Mochi's expansion cycle and pulse wave. Optical green-channel photoplethysmography measures capillary blood volume changes, heavily smoothed with low-pass EMA damping and display rate-limiting. |
| **Breathing Rate & Cadence** | Senses upper-chest and collarbone respiratory movement to synchronize Mochi's inhalation/exhalation expansions during 5–3–8 co-regulation. |
| **Facial Expressions** | Detects smiles, neutral calm, and surprised micro-expressions, dynamically shifting Mochi’s emotional state (`grin`, `calm`, `curious`, `love`). |
| **Head Pose & Face Center** | Tracks normalized face coordinates to drive Mochi’s gaze and organic squircle body lean across the webcam field of view. |

---

## 🛡️ Consent, Privacy & Data Handling

Mochi was designed from the ground up for strict privacy, non-invasive sensing, and ethical human monitoring:

1. **Explicit Multi-Step Consent**: Before the webcam turns on, users are presented with a 3-step consent disclosure detailing how sensing works, how data is handled, and setting boundaries.
2. **100% In-Memory Processing (Zero Video Storage)**: Video frames are streamed directly to a temporary memory buffer, processed for optical fluctuations, and immediately discarded. **No video, photos, or facial biometric templates are ever recorded, saved to disk, or sent to any server.**
3. **No Medical Claims**: Mochi is designed solely for relaxation, mindfulness, and desk posture awareness. Mochi is **not an FDA-cleared medical device** and makes no diagnosis, clinical decision-making, or treatment claims.
4. **No Covert Monitoring**: Camera sensing is strictly consensual and active only when the user explicitly triggers it.

---

## 🚀 Quick Start / Local Setup

### Prerequisites
- Node.js 18.17+ or 20+
- A working webcam

### 1. Clone the repository
```bash
git clone https://github.com/calebandcode/mochi.git
cd mochi
```

### 2. Install dependencies
```bash
npm install
```

### 3. Environment Variables (Optional)
If you have a Presage SmartSpectra API key:
```bash
cp .env.example .env.local
```
Add your key:
```env
SMARTSPECTRA_API_KEY=your_api_key_here
```
*(Note: If no API key is provided, Mochi automatically runs using its high-precision in-browser optical rPPG fallback pipeline).*

### 4. Run development server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Production build
```bash
npm run build
npm run start
```

---

## 📐 Architecture & Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack, React 19)
- **Styling**: Tailwind CSS v4, signature serif + Caveat handwritten typography
- **Animation**: Framer Motion physics springs (`stiffness`, `damping`)
- **Signal Processing**: Presage SmartSpectra SDK v3.5.0 + Web Audio API synthesizer
- **Card Exporter**: HTML5 Canvas retina 2.5× rasterizer for downloadable quote cards

---

## 📄 License

MIT © Caleb Akomaye
