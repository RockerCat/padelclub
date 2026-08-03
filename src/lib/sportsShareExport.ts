import { getFontEmbedCSS, toSvg } from "html-to-image";

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

// Bloque 3.6 — primera causa raíz encontrada (fuentes web) del bloqueo
// indefinido de "Compartir podio" (confirmada leyendo el código fuente
// instalado de html-to-image, no por especulación): toBlob()/toSvg()
// siempre intentan "incrustar" las fuentes web usadas por el nodo
// (embedWebFonts → getWebFontCSS → parseWebFontRules), y esa rutina escanea
// node.ownerDocument.styleSheets COMPLETO — todas las hojas de estilo del
// documento, nunca solo las del nodo capturado
// (html-to-image/lib/embed-webfonts.js:226). Si alguna hoja no puede leerse
// de forma síncrona (p. ej. cssRules bloqueado por CORS), cae a un
// fetch(sheet.href) de respaldo (embed-webfonts.js:178) que, junto con
// fetchAsDataURL para cada recurso de fuente (html-to-image/lib/dataurl.js:
// 56/113), no tiene ningún timeout ni AbortController — si esa petición
// nunca resuelve, toBlob() quedaba colgado para siempre. `skipFonts: true`
// (más abajo, en toSvg) sigue desactivando por completo esa rutina.
//
// Bloque 3.7 — SEGUNDA causa raíz, la que seguía bloqueando la imagen del
// nuevo diseño del póster aun con skipFonts:true (confirmada reproduciendo
// la llamada real de toBlob()/toCanvas() fuera de React, en Chrome
// headless, con avatares y logo reales embebidos — no por especulación):
// tanto toCanvas() como toBlob() de html-to-image dependen internamente de
// su propio createImage() (html-to-image/lib/util.js), que solo resuelve
// tras encadenar `img.decode().then(() => requestAnimationFrame(() =>
// resolve(img)))` — sin ningún `.catch()` en decode() y sin ningún timeout
// en la espera de ese siguiente frame. En pruebas repetidas con la tarjeta
// real (avatares/logo reales, más pesada visualmente que el diseño
// anterior), esa cadena decode()+rAF quedó intermitentemente sin resolver
// nunca — el mismo síntoma exacto reportado (spinner infinito, sin error),
// mientras que llamar a toSvg() (que NO pasa por createImage/decode/rAF) y
// rasterizar el resultado nosotros mismos, con onload/onerror explícitos y
// timeout propio, nunca se colgó en ninguna prueba.
//
// Corrección: exportCardToPngBlob ya no usa toBlob()/toCanvas() de
// html-to-image. Usa únicamente toSvg() (clonar nodo + incrustar
// imágenes/fondos ya resueltos a data URL por el caller + serializar —
// nunca depende de decode()/rAF) y luego rasteriza esa cadena por su cuenta
// con un <img> propio, con onload/onerror explícitos y un timeout acotado —
// ningún paso de esta función puede quedar pendiente para siempre. Además,
// ShareCardModal sigue aplicando su propio timeout global de generación
// (ver ese archivo) como defensa adicional ante cualquier otro colgado
// imprevisto, dentro o fuera de esta función.
const CARD_RASTER_TIMEOUT_MS = 8000;

// Bloque 3.8 — CAUSA de que la tipografía exportada no coincidiera con la
// de la app (confirmado inyectando html-to-image en la propia app real, vía
// CDP, no por especulación): `skipFonts: true` evita el colgado de fuentes
// del Bloque 3.6, pero también significa que la tarjeta serializada nunca
// lleva ningún `@font-face` — el nombre "Geist" queda en el font-family
// computado de cada nodo clonado, pero sin una regla `@font-face` DENTRO
// del propio SVG serializado, ese nombre no resuelve a ningún recurso: el
// <foreignObject> lo rasteriza con la fuente de reemplazo del sistema, no
// con Geist. Confirmado con una prueba directa: toSvg(..., {skipFonts:
// true}) nunca contiene "@font-face" en el SVG resultante.
//
// Corrección: en vez de dejar que html-to-image escanee TODO
// document.styleSheets sin límite (la causa del Bloque 3.6), se llama una
// sola vez a su propio getFontEmbedCSS(node, {}) — la misma rutina seria,
// pero acotada aquí con nuestro propio timeout — y el resultado (la regla
// @font-face real de Geist, con el .woff2 ya incrustado como data URI) se
// pasa a toSvg vía la opción fontEmbedCSS, que hace que internamente omita
// por completo su propio escaneo (ver embed-webfonts.js: "if
// (options.fontEmbedCSS != null) usa ese valor directo"). Confirmado que
// así sí queda un @font-face con "Geist" y el .woff2 embebido en el SVG
// final, y que ese SVG rasteriza sin error. Si esta llamada tarda más de
// lo razonable o falla, se degrada exactamente al comportamiento actual
// (skipFonts: true, tipografía de reemplazo) — nunca bloquea la
// generación por esto.
const FONT_EMBED_TIMEOUT_MS = 4000;

async function resolveCardFontEmbedCss(node: HTMLElement): Promise<string | null> {
  try {
    return await Promise.race([
      getFontEmbedCSS(node, {}),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("font embed timeout")), FONT_EMBED_TIMEOUT_MS)),
    ]);
  } catch {
    return null;
  }
}

function rasterizeSvgDataUrl(svgDataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let settled = false;

    function cleanup() {
      clearTimeout(timeoutId);
      img.onload = null;
      img.onerror = null;
    }

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      // Mismo mensaje que el timeout global de ShareCardModal — reutiliza
      // el mapeo a copy ya existente ahí ("La generación está tardando
      // demasiado. Intenta de nuevo."), sin necesitar un segundo caso.
      reject(new Error("La generación tardó demasiado."));
    }, CARD_RASTER_TIMEOUT_MS);

    img.onload = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(img);
    };
    img.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("No se pudo renderizar la imagen."));
    };
    img.decoding = "async";
    img.src = svgDataUrl;
  });
}

export async function exportCardToPngBlob(node: HTMLElement): Promise<Blob> {
  // Espera a que el navegador termine de pintar el nodo (ya montado con
  // imágenes como data URLs, carga inmediata sin red) antes de capturarlo
  // — nunca captura un frame a medio pintar. Acotada con un timeout propio
  // (nunca solo rAF sin límite — ver Bloque 3.7): si la pestaña queda en
  // segundo plano justo aquí, rAF puede pausarse indefinidamente; a los
  // 500ms se continúa de todas formas.
  await Promise.race([
    new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    new Promise<void>((resolve) => setTimeout(resolve, 500)),
  ]);

  // La misma tipografía que la app real (Geist) — nunca la de reemplazo
  // del sistema. document.fonts.ready ya resuelve por sí solo en cuanto
  // termina la carga de fuentes (éxito o fallo, nunca queda pendiente para
  // siempre por spec), pero se acota igual con un fallback de 1s por
  // consistencia con el resto de esta función (ver Bloque 3.7/3.8: ningún
  // paso depende de un recurso externo sin límite).
  await Promise.race([
    document.fonts.ready,
    new Promise<void>((resolve) => setTimeout(resolve, 1000)),
  ]);
  const fontEmbedCSS = await resolveCardFontEmbedCss(node);

  const svgDataUrl = await toSvg(node, {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    cacheBust: true,
    skipFonts: !fontEmbedCSS,
    fontEmbedCSS: fontEmbedCSS ?? undefined,
  });

  const img = await rasterizeSvgDataUrl(svgDataUrl);

  const canvas = document.createElement("canvas");
  canvas.width = SHARE_CARD_WIDTH;
  canvas.height = SHARE_CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo generar la imagen.");
  ctx.drawImage(img, 0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
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
