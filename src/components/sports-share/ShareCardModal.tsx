"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Download, Share2, X } from "lucide-react";
import { Button, Spinner } from "@/components/ui";
import {
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  canShareImageFile,
  downloadPngBlob,
  exportCardToPngBlob,
  sanitizeExportFilename,
  shareImagePng,
} from "@/lib/sportsShareExport";

interface ShareCardModalProps {
  title: string;
  card: ReactNode;
  filenameParts: string[];
  shareTitle: string;
  shareText?: string;
  onClose: () => void;
}

// Bloque 3.6 — límite razonable para el paso de captura completo
// (exportCardToPngBlob). html-to-image no expone ninguna forma de cancelar
// una captura en curso, así que este timeout nunca "aborta" la operación
// real — solo deja de esperarla: ver generationTokenRef más abajo, que
// asegura que una resolución tardía de un intento ya abandonado nunca
// pisa el estado de un intento más nuevo (reintento) ni de uno ya cerrado.
const GENERATION_TIMEOUT_MS = 15000;

// Bloque 3.4 — modal genérico de previsualización/compartir/descargar,
// reutilizado por Ranking y Torneos (Podio/Resultados) — una sola
// implementación de generación+interacción, nunca una por tarjeta. La
// tarjeta en sí (children) ya llega con todos los datos e imágenes
// resueltas por el caller; este componente solo la monta a tamaño real
// (1080×1350, jamás reducido internamente — ver spec "Previsualización"),
// la escala visualmente para el preview con transform:scale (nunca afecta
// lo que realmente se captura, que siempre usa width/height explícitos), y
// gestiona la generación del PNG + compartir/descargar.
export function ShareCardModal({ title, card, filenameParts, shareTitle, shareText, onClose }: ShareCardModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.28);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [status, setStatus] = useState<"generating" | "ready" | "error">("generating");
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Calculado una sola vez en cliente (nunca en SSR — esta pieza es
  // "use client" completa) — decide si el botón "Compartir" existe en
  // absoluto, nunca si se usa en vez de "Descargar": son dos acciones
  // reales y separadas, nunca una sola con fallback silencioso.
  const [canShare] = useState(() => canShareImageFile());

  // Escala del preview: el contenedor visible tiene su ancho real definido
  // por CSS (min(92vw, 380px), proporción 4:5) — el scale solo se deriva de
  // ese ancho para que la tarjeta de 1080px se vea completa y nítida, nunca
  // al revés. No usa ResizeObserver más que una vez por cambio de tamaño de
  // ventana, no una animación continua.
  useEffect(() => {
    function updateScale() {
      if (!wrapperRef.current) return;
      setScale(wrapperRef.current.clientWidth / SHARE_CARD_WIDTH);
    }
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  // Bloque 3.5 — guarda para nunca hacer setState después de que el modal
  // se cierre mientras la captura sigue en curso (exportCardToPngBlob tarda
  // ~1-2 frames + la conversión a PNG, tiempo suficiente para cerrar antes
  // de que resuelva).
  const unmountedRef = useRef(false);
  useEffect(() => {
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  // Bloque 3.6 — "token" del intento de generación vigente. html-to-image
  // no expone forma de cancelar una captura ya iniciada, así que cuando el
  // timeout global gana la carrera, la captura real puede seguir corriendo
  // en segundo plano y resolver (o rechazar) más tarde. Cada llamada a
  // generate() (incluido cada reintento) incrementa este contador y captura
  // su propio valor; si para cuando la promesa real se resuelve el
  // contador ya cambió (nuevo reintento) o el modal ya se desmontó, el
  // resultado se descarta en silencio — nunca pisa un estado más nuevo.
  const generationTokenRef = useRef(0);

  async function generate() {
    if (!cardRef.current) return;
    const token = ++generationTokenRef.current;
    setStatus("generating");
    setGenerationError(null);
    setBlob(null);

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        exportCardToPngBlob(cardRef.current),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error("La generación tardó demasiado.")),
            GENERATION_TIMEOUT_MS
          );
        }),
      ]);

      if (unmountedRef.current || generationTokenRef.current !== token) return;
      setBlob(result);
      setStatus("ready");
    } catch (err) {
      if (unmountedRef.current || generationTokenRef.current !== token) return;
      setBlob(null);
      setGenerationError(
        err instanceof Error && err.message === "La generación tardó demasiado."
          ? "La generación está tardando demasiado. Intenta de nuevo."
          : "No se pudo generar la imagen."
      );
      setStatus("error");
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  useEffect(() => {
    generate();
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  async function handleShare() {
    if (!blob || actionPending) return;
    setActionPending(true);
    setActionMessage(null);
    setActionError(null);
    try {
      const filename = sanitizeExportFilename(filenameParts);
      const result = await shareImagePng(blob, filename, shareTitle, shareText);
      if (result === "shared") setActionMessage("Imagen compartida correctamente.");
    } catch {
      setActionError("No se pudo compartir la imagen. Intenta descargarla.");
    } finally {
      setActionPending(false);
    }
  }

  function handleDownload() {
    if (!blob) return;
    downloadPngBlob(blob, sanitizeExportFilename(filenameParts));
    setActionMessage("Imagen descargada correctamente.");
    setActionError(null);
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-[500]" style={{ backdropFilter: "blur(4px)" }} onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center z-[501] pointer-events-none"
      >
        <div
          className="pointer-events-auto w-full md:w-auto md:max-w-md bg-[#082735] border border-white/10 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col isolate max-h-[92dvh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
            <h2 className="text-base font-semibold text-white">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-brand-muted hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-5 py-5 flex flex-col items-center gap-4">
            <div
              ref={wrapperRef}
              className="relative rounded-2xl overflow-hidden border border-white/10 shrink-0"
              style={{ width: "min(92vw, 380px)", aspectRatio: "4 / 5" }}
            >
              {status === "generating" && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#04141c]/80">
                  <Spinner size="md" />
                </div>
              )}
              {status === "error" && (
                <div
                  role="status"
                  className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#04141c]/95 px-6 text-center"
                >
                  <p className="text-sm text-red-400">{generationError ?? "No se pudo generar la imagen."}</p>
                  <Button type="button" variant="secondary" size="sm" onClick={generate}>
                    Reintentar
                  </Button>
                </div>
              )}
              <div style={{ width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT, transform: `scale(${scale})`, transformOrigin: "top left" }}>
                <div ref={cardRef} style={{ width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT }}>
                  {card}
                </div>
              </div>
            </div>

            {actionMessage && (
              <p role="status" className="text-sm text-brand-primary text-center">
                {actionMessage}
              </p>
            )}
            {actionError && (
              <p role="status" className="text-sm text-red-400 text-center">
                {actionError}
              </p>
            )}

            <div className="w-full flex flex-col gap-2">
              {canShare && (
                <Button
                  type="button"
                  onClick={handleShare}
                  disabled={status !== "ready"}
                  loading={actionPending}
                  aria-label="Compartir imagen"
                >
                  <Share2 className="w-4 h-4" aria-hidden="true" />
                  Compartir
                </Button>
              )}
              <Button
                type="button"
                variant={canShare ? "secondary" : "primary"}
                onClick={handleDownload}
                disabled={status !== "ready"}
                aria-label="Descargar imagen"
              >
                <Download className="w-4 h-4" aria-hidden="true" />
                Descargar
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
