import { toBlob } from "html-to-image";

// Bloque 3.4 — utilidades puras de exportación visual (PNG) para Ranking y
// Torneos. Nunca calcula ni toca datos deportivos: solo convierte un nodo ya
// renderizado (con datos reales pasados por el caller) en una imagen.
//
// html-to-image (no html2canvas): serializa el nodo como SVG <foreignObject>
// y deja que el propio motor del navegador lo rinda — mejor fidelidad con
// Tailwind (gradientes, border-radius, sombras, SVGs de lucide-react) que un
// motor de layout reimplementado desde cero, y sin dependencias de Node en
// el cliente. Único paquete de exportación en el proyecto (auditado: no
// existía ninguno antes — ver package.json).

export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1350;

// Bloque 3.6 — 6s por imagen: ni una imagen remota lenta/colgada (Supabase
// Storage caído, red del cliente) ni un bucket privado inaccesible deben
// bloquear la resolución completa. Rango pedido: 5-8s.
const IMAGE_FETCH_TIMEOUT_MS = 6000;

// Convierte una URL remota (avatar/logo, típicamente Supabase Storage
// público) a un data URL propio ANTES de montar la tarjeta exportable — así
// html-to-image nunca necesita volver a buscar una imagen cross-origin al
// capturar (la causa real más común de fallos silenciosos/CORS en este tipo
// de librerías). Si falla por cualquier razón (404, CORS, red, bucket
// privado, timeout) devuelve null y el caller cae al mismo fallback de
// iniciales que ya usa PlayerAvatar/ClubMark — nunca lanza, nunca bloquea el
// resto de la generación por una sola imagen rota o lenta.
export async function resolveImageDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { mode: "cors", signal: controller.signal });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    // Cubre tanto un fallo real (404/CORS/red) como el abort por timeout —
    // en ambos casos, el caller cae al mismo fallback de iniciales.
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Resuelve varias imágenes en paralelo (nunca en serie, nunca una consulta
// nueva por jugador — son fetch de archivos ya públicos, no RPCs).
export async function resolveImageDataUrls(
  urls: Array<string | null | undefined>
): Promise<Array<string | null>> {
  return Promise.all(urls.map(resolveImageDataUrl));
}

// Bloque 3.6 — CAUSA RAÍZ del bloqueo indefinido de "Compartir podio"
// (confirmada leyendo el código fuente instalado de html-to-image, no por
// especulación): toBlob()/toSvg() siempre intentan "incrustar" las fuentes
// web usadas por el nodo (embedWebFonts → getWebFontCSS →
// parseWebFontRules), y esa rutina escanea node.ownerDocument.styleSheets
// COMPLETO — todas las hojas de estilo del documento, nunca solo las del
// nodo capturado (html-to-image/lib/embed-webfonts.js:226). Si alguna hoja
// no puede leerse de forma síncrona (p. ej. cssRules bloqueado por CORS),
// cae a un fetch(sheet.href) de respaldo (embed-webfonts.js:178) que, junto
// con fetchAsDataURL para cada recurso de fuente
// (html-to-image/lib/dataurl.js:56/113), NO tiene ningún timeout ni
// AbortController en ningún punto de la librería — si esa petición nunca
// resuelve, toBlob() quedaba colgado para siempre, sin nunca resolver ni
// rechazar, exactamente el síntoma reportado (spinner infinito, sin error).
// Nuestras propias imágenes (avatar/logo) ya llegan como data URLs
// resueltas por el caller, así que esto nunca dependía de ellas — dependía
// de hojas de estilo ajenas al nodo, fuera de nuestro control directo.
//
// Corrección mínima: `skipFonts: true` desactiva por completo esa rutina
// (la librería expone esta opción exactamente para este caso, ver
// html-to-image/lib/embed-webfonts.js:291). El texto capturado sigue
// usando la fuente ya cargada/cacheada por el propio navegador para
// renderizar la página (Geist, autoalojada por next/font/google) — sin
// incrustarla explícitamente en el SVG, pero sin bloquear nunca la
// generación. Además de esto, exportCardToPngBlob ya no es la única
// barrera: ShareCardModal aplica un timeout global de generación (ver ese
// archivo) como defensa adicional ante cualquier otro colgado imprevisto,
// dentro o fuera de esta función.
export async function exportCardToPngBlob(node: HTMLElement): Promise<Blob> {
  // Doble rAF: dentro del modal, el nodo ya se montó con imágenes como data
  // URLs (carga inmediata, sin red) — esto solo espera a que el navegador
  // termine de pintar ese DOM antes de capturarlo, para nunca capturar un
  // frame a medio pintar.
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

  const blob = await toBlob(node, {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    pixelRatio: 1,
    cacheBust: true,
    skipFonts: true,
  });

  if (!blob) throw new Error("No se pudo generar la imagen.");
  return blob;
}

// mi-padel-club-ranking-mi-club-6a.png — nunca espacios, tildes, símbolos ni
// UUIDs; siempre el mismo prefijo de marca.
export function sanitizeExportFilename(parts: string[]): string {
  const slug = parts
    .filter(Boolean)
    .join("-")
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `mi-padel-club-${slug}.png`;
}

// Comprueba soporte real de "compartir el archivo" (nunca solo
// `typeof navigator.share === "function"`, que existe en navegadores que
// solo soportan compartir texto/URL) — se usa para decidir si el botón
// "Compartir" se muestra en el modal, nunca para ejecutar la acción.
export function canShareImageFile(): boolean {
  if (typeof navigator === "undefined" || !navigator.canShare) return false;
  const probe = new File([new Uint8Array([0])], "probe.png", { type: "image/png" });
  try {
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export function downloadPngBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoca en el siguiente tick — el navegador ya tomó la referencia del
  // blob para iniciar la descarga antes de que se libere.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Web Share API con el ARCHIVO PNG (nunca solo una URL de texto — el
// objetivo es compartir la imagen en sí). Solo se llama cuando
// canShareImageFile() ya confirmó soporte real — este componente asume esa
// precondición y no cae a descarga por sí mismo (eso es una acción
// explícita y separada en la UI, ver ShareCardModal). Si el usuario cancela
// la hoja nativa de compartir, el navegador lanza AbortError — se trata
// como "cancelled", nunca como error.
export async function shareImagePng(
  blob: Blob,
  filename: string,
  shareTitle: string,
  shareText?: string
): Promise<"shared" | "cancelled"> {
  const file = new File([blob], filename, { type: "image/png" });
  try {
    await navigator.share({ files: [file], title: shareTitle, text: shareText });
    return "shared";
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    throw err;
  }
}
