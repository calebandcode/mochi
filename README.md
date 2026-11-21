# Mochi (mochi.) — A Bio-Responsive Companion for Daily Stillness

> **Senses your pulse, breath, expressions, and head position through your camera—no wearables required.**

Built for the **[Presage SmartSpectra SDK Challenge](https://dev.to/challenges/presage-2026-11-04)** on DEV.to.

---

## 🌟 Overview

**Mochi** is a bio-responsive web companion powered directly by the **Presage `@smartspectra/node-sdk` (v3.5.0)**. It captures live video from your webcam at 30 FPS via the native C++ SmartSpectra runtime and streams real-time decoded physiological signals over Server-Sent Events (SSE) into an expressive, physics-driven squircle companion.

Instead of cold medical charts or clinical dashboards, Mochi translates live human signals into warm, mindful co-regulation:
- **Awakening by Live Pulse**: Mochi starts dormant (`× ×`). Once you grant consent and the Presage SDK locks onto your face and pulse, two warm streams meet around Mochi's border and wake it up.
- **5–3–8 Restorative Breathing**: Guides your nervous system through a 5s inhale, 3s hold, 8s prolonged exhale cadence while syncing with your live Presage breathing trace.
- **Face & Gaze Following**: Driven by Presage's real-time 478-point `face.landmarks`, Mochi’s eyes and soft squircle body tilt, stretch, and follow your face as you move.
- **Stillness Streaks & Celebrations**: Tracks daily calendar-day stillness streaks with an ambient milestone screen.
- **Exportable Affirmation Cards**: Double-click Mochi at any time to flip into a handwritten Caveat quote card you can download as a high-resolution PNG.

---

## 🔬 Presage SmartSpectra SDK Integration

Mochi runs a pure, zero-fallback integration with **`@smartspectra/node-sdk` v3.5.0**:

1. **Native SDK Singleton ([`lib/smartspectra-server.ts`](./lib/smartspectra-server.ts))**: Instantiates `new SmartSpectraSDK({ apiKey: process.env.SMARTSPECTRA_API_KEY, requestedMetrics: [...breathingMetrics, ...cardioMetrics, ...faceMetrics], enableTelemetry: false })` and captures directly from the local webcam at 30 FPS via `sdk.useCamera(CameraSelection.default, { width: 640, height: 480, fps: 30 })`.
2. **Live Protobuf Decoding & SSE Bridge ([`app/api/smartspectra/stream/route.ts`](./app/api/smartspectra/stream/route.ts))**: Decodes live binary `Metrics` buffers with `decodeMetrics(buf)` from `@smartspectra/node-sdk/messages` and streams JSON events (`metrics`, `validation`, `processingStatus`) to the React client ([`lib/smartspectra-sensor.ts`](./lib/smartspectra-sensor.ts)).

| Live Presage Signal | Protobuf Field | How Mochi Responds in Real Time |
| :--- | :--- | :--- |
| **Pulse & Arterial Trace** | `cardio.pulseRate`, `cardio.arterialPressureTrace`, `cardio.hrv` | Drives the live BPM readout, feathered red waveform bars, HRV badge, and Mochi's heartbeat border ripples. |
| **Breathing Rate & Wave** | `breathing.rate`, `breathing.upperTrace` | Drives Mochi’s physical expansion/contraction and live breaths/min readout. |
| **Facial Expressions** | `face.expression` | Maps `HAPPY`, `SURPRISE`, and `NEUTRAL` scores to Mochi’s live mood (`grin`, `surprised`, `calm`). |
| **478-Point Face Landmarks** | `face.landmarks` | Tracks face presence (drops to `-- BPM` when you step away) and drives Mochi’s gaze, tilt, and squircle lean. |
| **Validation Status** | `validationStatus` | Surfaces real-time Presage guidance (e.g., *"Place more of the chest in view"*, *"Center face in view"*, *"Hold still"*). |

---

## 🛡️ Consent, Privacy & Data Handling

Mochi was designed for strict privacy, explicit consent, and ethical human sensing:

1. **Explicit 3-Step Camera Consent**: Before activating the SDK, users walk through an interactive 3-step consent modal ([`components/consent-modal.tsx`](./components/consent-modal.tsx)) explaining camera sensing, zero-storage data handling, and wellness-only boundaries.
2. **Zero Video or Biometric Storage**: Video frames are processed strictly in volatile memory by the local native SmartSpectra runtime and immediately discarded. **No video, photos, or biometric profiles are ever recorded, written to disk, or saved to a database.** Only your local calendar-day stillness streak count is stored in `localStorage`.
3. **SDK Telemetry Opt-Out**: `SmartSpectraSDK` is initialized with `enableTelemetry: false`. Your `SMARTSPECTRA_API_KEY` is used only by the SDK for standard Presage API authorization/usage verification.
4. **No Medical Claims**: Mochi and SmartSpectra metrics are for general wellness, relaxation, and mindfulness only. Mochi is **not an FDA-cleared medical device** and must not be used for diagnosis, medical decision-making, or treatment.
5. **No Covert Monitoring**: Sensing starts only when the user explicitly clicks through consent and stops immediately when the session closes.

---

## 🚀 Local Setup Instructions

Because `@smartspectra/node-sdk` is a native C++ SDK (`win32-x64`, `darwin-arm64`, `linux-x64` with GLIBC 2.35+) that accesses your physical webcam at 30 FPS, run Mochi locally for live sensing.

### Prerequisites
- Node.js 18.17+ or 20+
- A working webcam
- A Presage SmartSpectra API key ([register here](https://physiology.presagetech.com/auth/register))

### 1. Clone the repository
```bash
git clone https://github.com/calebandcode/mochi.git
cd mochi
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure your Presage API Key (Required)
Create a `.env.local` file in the project root:
```env
SMARTSPECTRA_API_KEY=your_presage_api_key_here
```

### 4. Run the development server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser, click **Turn on my camera**, complete the 3-step consent modal, and wait ~10–15 seconds in good lighting for Presage SmartSpectra to lock onto your live pulse and breathing rate.

*(Note: Make sure no other app like Zoom, OBS, or another browser tab is holding your webcam lock on Windows.)*

---

## 📐 Tech Stack

- **Biometric Sensing**: Presage `@smartspectra/node-sdk` v3.5.0 (native C++ runtime + protobuf `decodeMetrics`)
- **Framework**: Next.js 16 (App Router, Turbopack, React 19, Server-Sent Events)
- **Styling & Motion**: Tailwind CSS v4, Framer Motion physics springs, Caveat + Cormorant Garamond typography
- **Audio & Export**: Web Audio API synthesizer + HTML5 Canvas 2.5× retina PNG quote card exporter

---

## 📄 License

MIT © Caleb Akomaye
