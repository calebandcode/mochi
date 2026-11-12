import { toPng } from "html-to-image";
import type { Affirmation } from "./affirmations-data";

export async function downloadQuoteCard(
  cardElement: HTMLElement | null,
  affirmation: Affirmation,
  filename = "mochi-quote.png"
) {
  if (cardElement) {
    try {
      const dataUrl = await toPng(cardElement, {
        pixelRatio: 2.5,
        cacheBust: true,
      });
      const link = document.createElement("a");
      link.download = filename;
      link.href = dataUrl;
      link.click();
      return;
    } catch (err) {
      console.warn("html-to-image fallback triggered", err);
    }
  }

  // Fallback: Crisp 1080x1080 Canvas drawing
  const canvas = document.createElement("canvas");
  const size = 1080;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  // Soft ambient radial glow
  const glowGrad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    80,
    size / 2,
    size / 2,
    480
  );
  glowGrad.addColorStop(0, "rgba(251, 191, 36, 0.16)");
  glowGrad.addColorStop(1, "transparent");
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, size, size);

  // Squircle Card Dimensions
  const cardW = 740;
  const cardH = 620;
  const cardX = (size - cardW) / 2;
  const cardY = (size - cardH) / 2 - 24;
  const radius = 96;

  // Shadow + Body Fill
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.08)";
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = affirmation.theme.bg || "#ffffff";
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, radius);
  ctx.fill();
  ctx.restore();

  // Border
  ctx.strokeStyle = affirmation.theme.border || "#e4e4e7";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, radius);
  ctx.stroke();

  // Text
  ctx.fillStyle = affirmation.theme.text || "#18181b";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const isSerif = affirmation.fontStyle === "serif-italic";
  ctx.font = isSerif
    ? "italic 44px 'Cormorant Garamond', Georgia, serif"
    : "bold 54px 'Caveat', cursive, sans-serif";

  const totalLines = affirmation.lines.length;
  const lineHeight = isSerif ? 58 : 70;
  const startY = cardY + cardH / 2 - ((totalLines - 1) * lineHeight) / 2;

  affirmation.lines.forEach((line, idx) => {
    ctx.fillText(line, size / 2, startY + idx * lineHeight);
  });

  // Author if any
  if (affirmation.author) {
    ctx.font = "italic 28px 'Caveat', cursive, sans-serif";
    ctx.fillStyle = affirmation.theme.text || "#18181b";
    ctx.fillText(
      affirmation.author,
      size / 2,
      startY + totalLines * lineHeight + 10
    );
  }

  // Watermark
  ctx.font = "500 20px 'Geist Mono', monospace";
  ctx.fillStyle = "#a1a1aa";
  ctx.fillText("Mochi · Breathe with me", size / 2, size - 70);

  const dataUrl = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

