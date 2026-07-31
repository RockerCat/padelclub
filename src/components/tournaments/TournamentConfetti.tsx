"use client";

import { useEffect, useState } from "react";

interface TournamentConfettiProps {
  onDone: () => void;
}

interface ConfettiPiece {
  id: number;
  left: number;
  delay: number;
  duration: number;
  color: string;
  width: number;
  height: number;
}

const COLORS = ["#00ffff", "#f59e0b", "#f472b6", "#34d399", "#818cf8"];
const PIECE_COUNT = 36;

// Math.random() nunca se llama durante el render (regla de pureza de
// React) — solo dentro del efecto de montaje, vía este generador.
function generatePieces(): ConfettiPiece[] {
  return Array.from({ length: PIECE_COUNT }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.6,
    duration: 2.2 + Math.random() * 1.2,
    color: COLORS[i % COLORS.length],
    width: 6 + Math.random() * 5,
    height: 9 + Math.random() * 6,
  }));
}

// Celebración breve al finalizar un torneo — piezas CSS puras (sin
// canvas, sin librería nueva), nunca bloquea interacción
// (pointer-events-none) y se autodestruye sola (onDone) ~3s después de
// montar. A quién y cuándo mostrarse (una sola vez por torneo por
// sesión, respetando prefers-reduced-motion) lo decide enteramente
// TournamentDetailView antes de montar este componente — aquí solo se
// dibuja y se apaga sola.
export function TournamentConfetti({ onDone }: TournamentConfettiProps) {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setPieces(generatePieces()));
    const timer = window.setTimeout(onDone, 3200);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[500] overflow-hidden pointer-events-none motion-reduce:hidden"
    >
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className="absolute top-0 rounded-sm confetti-piece"
          style={{
            left: `${piece.left}%`,
            width: piece.width,
            height: piece.height,
            backgroundColor: piece.color,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
