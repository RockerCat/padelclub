import type { ReactNode } from "react";
import { Trophy } from "lucide-react";
import { SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT } from "@/lib/sportsShareExport";

interface ShareCardShellProps {
  clubName: string;
  clubLogoDataUrl: string | null;
  accentColor: string;
  eyebrow: string;
  title: string;
  subtitle?: string | null;
  generatedAtLabel: string;
  children: ReactNode;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function ClubMark({ name, logoDataUrl }: { name: string; logoDataUrl: string | null }) {
  if (logoDataUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- data URL ya resuelta, nunca una imagen remota en el momento de capturar
    return <img src={logoDataUrl} alt="" className="w-24 h-24 rounded-2xl object-cover border-2 border-white/20 shadow-lg shrink-0" />;
  }
  return (
    <div className="w-24 h-24 rounded-2xl bg-white/10 border-2 border-white/20 flex items-center justify-center text-4xl font-black text-white shrink-0">
      {getInitials(name)}
    </div>
  );
}

// Bloque de rediseño "póster deportivo" — mismo marco compartido por el
// export de Ranking (única tarjeta que lo usa hoy; ver Sports Data Export
// Principles). Fondo fijo, independiente del tema claro/oscuro del
// visitante — es una imagen estática para compartir, no una superficie de
// la app. 1080×1350 fijo (nunca depende de viewport) — el caller controla
// cuándo mostrarlo escalado (preview) vs. sin escalar (captura real).
//
// Capas de fondo (de atrás hacia adelante): gradiente base de marca →
// resplandores radiales con el accentColor del club → textura de líneas
// diagonales muy sutil (lenguaje de póster deportivo/esports, nunca un
// patrón que compita con el contenido) → trofeo gigante en watermark →
// contenido real. Todo puramente decorativo, sin datos.
export function ShareCardShell({
  clubName,
  clubLogoDataUrl,
  accentColor,
  eyebrow,
  title,
  subtitle,
  generatedAtLabel,
  children,
}: ShareCardShellProps) {
  return (
    <div
      style={{
        width: SHARE_CARD_WIDTH,
        height: SHARE_CARD_HEIGHT,
        background: "linear-gradient(165deg, #051820 0%, #04141c 45%, #020d12 100%)",
      }}
      className="relative flex flex-col overflow-hidden"
    >
      {/* Resplandores radiales con el color del club — identidad, nunca
          estado (ver Club Identity Principles). */}
      <div
        className="absolute -top-40 -right-24 w-[680px] h-[680px] rounded-full opacity-[0.22] blur-[120px] pointer-events-none"
        style={{ backgroundColor: accentColor }}
      />
      <div
        className="absolute top-[420px] -left-52 w-[560px] h-[560px] rounded-full opacity-[0.14] blur-[110px] pointer-events-none"
        style={{ backgroundColor: accentColor }}
      />
      <div className="absolute bottom-0 inset-x-0 h-[420px] bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />

      {/* Textura de líneas diagonales — apenas perceptible, le da la
          "profundidad" de póster/esports pedida sin volverse ruido. */}
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage: "repeating-linear-gradient(115deg, #ffffff 0px, #ffffff 2px, transparent 2px, transparent 34px)",
        }}
      />

      {/* Trofeo gigante como marca de agua, detrás del título — puro
          adorno, aria-hidden, nunca interfiere con datos reales. */}
      <Trophy
        aria-hidden="true"
        className="absolute -right-16 top-[210px] w-[420px] h-[420px] opacity-[0.05] pointer-events-none"
        style={{ color: accentColor }}
        strokeWidth={1}
      />

      <div className="relative flex flex-col h-full px-16 py-14">
        {/* Header — identidad del club primero, Mi Pádel Club en un badge
            secundario, nunca compitiendo visualmente (ver spec "Marca del
            club"). */}
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-6 min-w-0">
            <ClubMark name={clubName} logoDataUrl={clubLogoDataUrl} />
            <div className="min-w-0">
              <p className="text-3xl font-bold text-white truncate max-w-[520px] leading-tight">{clubName}</p>
              <p className="text-base font-semibold text-white/45 mt-1.5 uppercase tracking-[0.2em]">{eyebrow}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2.5 shrink-0">
            <Trophy className="w-4 h-4" style={{ color: accentColor }} aria-hidden="true" />
            <span className="text-sm font-semibold text-white/80 whitespace-nowrap">Mi Pádel Club</span>
          </div>
        </div>

        {/* Título — grande, protagonista, con el "Top N" como badge sólido
            en vez de texto secundario apagado. */}
        <div className="mt-12 shrink-0">
          <h1 className="text-[64px] font-black text-white leading-[1.05] uppercase tracking-tight line-clamp-2">
            {title}
          </h1>
          {subtitle && (
            <span
              className="inline-block mt-4 rounded-full px-6 py-2 text-xl font-black uppercase tracking-[0.15em]"
              style={{ backgroundColor: accentColor, color: "#04141c" }}
            >
              {subtitle}
            </span>
          )}
        </div>

        {/* Cuerpo — específico de cada tarjeta (podio + listado) */}
        <div className="mt-10 flex-1 min-h-0 overflow-hidden">{children}</div>

        {/* Footer — marca secundaria discreta, nunca compite con la
            identidad del club: fecha + mipadel.club + marca Mi Pádel Club. */}
        <div className="mt-8 pt-6 border-t border-white/10 flex items-center justify-between shrink-0">
          <span className="text-sm text-white/40">{generatedAtLabel}</span>
          <div className="flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-white/30" aria-hidden="true" />
            <span className="text-sm font-semibold text-white/40">mipadel.club</span>
          </div>
        </div>
      </div>
    </div>
  );
}
