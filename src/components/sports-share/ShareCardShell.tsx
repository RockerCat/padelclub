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
    return <img src={logoDataUrl} alt="" className="w-20 h-20 rounded-2xl object-cover border border-white/15 shrink-0" />;
  }
  return (
    <div className="w-20 h-20 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center text-3xl font-black text-white shrink-0">
      {getInitials(name)}
    </div>
  );
}

// Bloque 3.4 — marco visual compartido por las 3 tarjetas exportables
// (Ranking Top 10, Podio de Torneo, Resultados de Torneo). Fondo fijo,
// independiente del tema claro/oscuro del visitante — esto es una imagen
// estática para compartir, no una superficie de la app, así que su
// apariencia debe ser siempre la misma sin importar quién la genere.
// 1080×1350 fijo (nunca depende de viewport) — el caller controla cuándo
// mostrarlo escalado (preview) vs. sin escalar (captura real).
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
      style={{ width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT, backgroundColor: "#04141c" }}
      className="relative flex flex-col overflow-hidden"
    >
      {/* Glow decorativo con el color pasado por el llamador — nunca
          inventado aquí; hoy siempre CLUB_PRIMARY_COLOR (identidad
          cromática fija de Mi Pádel Club, ver
          src/lib/constants/clubTheme.ts), nunca un valor personalizado por
          club. */}
      <div
        className="absolute -top-32 -right-32 w-[560px] h-[560px] rounded-full opacity-25 blur-3xl pointer-events-none"
        style={{ backgroundColor: accentColor }}
      />
      <div
        className="absolute -bottom-40 -left-40 w-[480px] h-[480px] rounded-full opacity-10 blur-3xl pointer-events-none"
        style={{ backgroundColor: accentColor }}
      />

      <div className="relative flex flex-col h-full px-16 py-14">
        {/* Header — identidad del club primero, Mi Pádel Club en un badge
            secundario, nunca compitiendo visualmente (ver spec "Marca del
            club"). */}
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-5 min-w-0">
            <ClubMark name={clubName} logoDataUrl={clubLogoDataUrl} />
            <div className="min-w-0">
              <p className="text-2xl font-bold text-white truncate max-w-[520px]">{clubName}</p>
              <p className="text-base text-white/45 mt-1 uppercase tracking-wider">{eyebrow}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 shrink-0">
            <Trophy className="w-4 h-4" style={{ color: accentColor }} aria-hidden="true" />
            <span className="text-sm font-semibold text-white/80 whitespace-nowrap">Mi Pádel Club</span>
          </div>
        </div>

        {/* Título */}
        <div className="mt-10 shrink-0">
          <h1 className="text-5xl font-black text-white leading-tight line-clamp-2">{title}</h1>
          {subtitle && <p className="text-xl text-white/55 mt-2 line-clamp-1">{subtitle}</p>}
        </div>

        {/* Cuerpo — específico de cada tarjeta */}
        <div className="mt-10 flex-1 min-h-0 overflow-hidden">{children}</div>

        {/* Footer — marca secundaria, nunca compite con la identidad del club */}
        <div className="mt-8 pt-6 border-t border-white/10 flex items-center justify-between shrink-0">
          <span className="text-sm text-white/40">{generatedAtLabel}</span>
          <span className="text-sm font-semibold text-white/40">mipadel.club</span>
        </div>
      </div>
    </div>
  );
}
