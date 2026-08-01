import type { LucideIcon } from "lucide-react";
import { Trophy, Medal, Crown, Star, ArrowUpCircle } from "lucide-react";
import type { PlayerAchievement } from "@/lib/playerDashboard";

const ACHIEVEMENT_ICON: Record<string, LucideIcon> = {
  "first-tournament": Trophy,
  "first-podium": Medal,
  "first-championship": Crown,
  "top-3": Star,
  "category-promotion": ArrowUpCircle,
};

// Sección "Logros deportivos" — computeAchievements (@/lib/playerDashboard)
// ya decide, con datos reales, cuáles aplican; este componente nunca
// inventa ni oculta un logro por su cuenta. Sin logros todavía no se
// muestra la sección (nunca una grilla vacía). Con más protagonismo que
// antes (tarjeta propia a todo el ancho, acento ámbar — el mismo tono ya
// usado para medallas/podio en Ranking, nunca el `var(--club-primary)`
// genérico de las demás métricas) pero sin convertirse en un sistema de
// gamificación nuevo: mismos 5 logros posibles, mismo cálculo.
export function AchievementsSection({ achievements }: { achievements: PlayerAchievement[] }) {
  if (achievements.length === 0) return null;

  return (
    <div className="bg-brand-surface border border-amber-400/20 rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="w-4 h-4 text-amber-400" />
        <h2 className="text-sm font-semibold text-white">Logros deportivos</h2>
        <span className="text-xs text-brand-muted">({achievements.length})</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {achievements.map((a) => {
          const Icon = ACHIEVEMENT_ICON[a.id] ?? Trophy;
          return (
            <div
              key={a.id}
              className="bg-amber-400/[0.06] border border-amber-400/20 rounded-2xl p-4 flex flex-col items-center text-center gap-2"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-400/15 text-amber-400">
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-white leading-tight">{a.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
