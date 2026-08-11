import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronDown, ChevronUp, XCircle } from "lucide-react-native";
import { theme } from "../lib/theme";
import { durationLabel } from "../lib/durations";
import { addMinutes } from "../lib/time";
import { formatShortDate } from "../lib/dateFormat";
import type { RejectedReservation } from "../lib/reservationAdminRequests";

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

// "12 de agosto, 3:45 p.m." — mismo criterio que formatRejectedAt en la
// web (toLocaleString "es-MX", día + mes largo + hora).
const MONTH_LONG = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function formatRejectedAt(iso: string): string {
  const d = new Date(iso);
  const hours = d.getHours();
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  const mins = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours < 12 ? "a.m." : "p.m.";
  return `${d.getDate()} de ${MONTH_LONG[d.getMonth()]}, ${h12}:${mins} ${ampm}`;
}

type PeriodFilter = "30" | "90" | "all";
const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: "30", label: "30 días" },
  { value: "90", label: "90 días" },
  { value: "all", label: "Todo" },
];
const DAY_MS = 24 * 60 * 60 * 1000;

// Una fila sin rejected_at (no debería pasar tras la migración, pero es
// nullable) nunca se oculta por el filtro de periodo — mismo criterio "no
// ocultar" que la web.
function isWithinPeriod(rejectedAt: string | null, period: PeriodFilter, now: number): boolean {
  if (period === "all" || !rejectedAt) return true;
  const cutoff = now - Number(period) * DAY_MS;
  return new Date(rejectedAt).getTime() >= cutoff;
}

// Traducción 1:1 de RejectedReservationsSection.tsx (app web) — historial
// operativo colapsado por defecto (para no competir con el grid de Agenda),
// mismo filtro de periodo 30/90/todo aplicado client-side sobre el mismo
// conjunto ya cargado, mismas tarjetas de solo lectura (motivo, fecha,
// quién rechazó, valor). El enlace "ver detalle" de la web se omite: no
// hay una pantalla de detalle equivalente en mobile con más información
// que la que esta misma tarjeta ya muestra.
export function RejectedReservationsSection({ reservations }: { reservations: RejectedReservation[] }) {
  const [expanded, setExpanded] = useState(false);
  const [period, setPeriod] = useState<PeriodFilter>("30");

  if (reservations.length === 0) return null;

  const now = Date.now();
  const filtered = reservations.filter((r) => isWithinPeriod(r.rejected_at, period, now));

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => setExpanded((v) => !v)} style={styles.header} activeOpacity={0.7}>
        <XCircle width={16} height={16} color={theme.colors.danger} />
        <Text style={styles.title}>Reservas rechazadas</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{reservations.length}</Text>
        </View>
        {expanded ? (
          <ChevronUp width={16} height={16} color={theme.colors.muted} style={styles.chevron} />
        ) : (
          <ChevronDown width={16} height={16} color={theme.colors.muted} style={styles.chevron} />
        )}
      </TouchableOpacity>

      {expanded && (
        <>
          <View style={styles.periodRow}>
            {PERIOD_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setPeriod(opt.value)}
                style={[styles.periodPill, period === opt.value && styles.periodPillActive]}
              >
                <Text style={[styles.periodPillText, period === opt.value && styles.periodPillTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {filtered.length === 0 ? (
            <Text style={styles.empty}>No hay reservas rechazadas en este periodo.</Text>
          ) : (
            <View style={{ gap: 10 }}>
              {filtered.map((r) => (
                <View key={r.id} style={styles.card}>
                  <View style={styles.cardTopRow}>
                    <View style={styles.rejectedBadge}>
                      <Text style={styles.rejectedBadgeText}>Rechazada</Text>
                    </View>
                    <Text style={styles.playerName}>{r.playerName ?? "Jugador"}</Text>
                  </View>
                  <Text style={styles.meta}>
                    {formatShortDate(r.date)} · {r.courtName} · {r.start_time.slice(0, 5)}–{addMinutes(r.start_time.slice(0, 5), r.duration_minutes)} ·{" "}
                    {durationLabel(r.duration_minutes)}
                  </Text>
                  {r.rejection_reason && <Text style={styles.reason}>{r.rejection_reason}</Text>}
                  {r.rejected_at && (
                    <Text style={styles.rejectedAt}>
                      Rechazada el {formatRejectedAt(r.rejected_at)}
                      {r.rejectedByName ? ` por ${r.rejectedByName}` : ""}
                    </Text>
                  )}
                  {r.price_amount != null && r.price_currency && (
                    <Text style={styles.price}>{formatCurrency(r.price_amount, r.price_currency)}</Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 15, fontWeight: "700", color: theme.colors.white },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: "rgba(248,113,113,0.15)" },
  badgeText: { fontSize: 12, fontWeight: "600", color: theme.colors.danger },
  chevron: { marginLeft: "auto" },
  periodRow: { flexDirection: "row", gap: 8 },
  periodPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  periodPillActive: { borderColor: theme.colors.primary, backgroundColor: `${theme.colors.primary}1A` },
  periodPillText: { fontSize: 12, fontWeight: "600", color: theme.colors.muted },
  periodPillTextActive: { color: theme.colors.primary },
  empty: { fontSize: 13, color: theme.colors.muted, paddingVertical: 12 },
  card: { borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.05)", padding: 16, gap: 2 },
  cardTopRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  rejectedBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: "rgba(248,113,113,0.15)" },
  rejectedBadgeText: { fontSize: 11, fontWeight: "700", color: theme.colors.danger },
  playerName: { fontSize: 14, fontWeight: "600", color: theme.colors.white },
  meta: { fontSize: 13, color: theme.colors.muted, marginTop: 4 },
  reason: { fontSize: 13, color: "rgba(248,113,113,0.9)", marginTop: 4 },
  rejectedAt: { fontSize: 11, color: "rgba(148,163,184,0.6)", marginTop: 4 },
  price: { fontSize: 13, fontWeight: "600", color: theme.colors.white, marginTop: 6 },
});
