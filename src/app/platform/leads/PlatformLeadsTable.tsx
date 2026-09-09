"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Handshake } from "lucide-react";
import { Badge, FilterDropdown } from "@/components/ui";

export type PlatformLeadRow = {
  id: string;
  contact_name: string;
  club_name: string;
  city: string;
  whatsapp: string;
  number_of_courts: number | null;
  status: "new" | "contacted" | "demo_scheduled" | "demo_completed" | "won" | "lost";
  demo_at: string | null;
  created_at: string;
  converted_club_id: string | null;
};

type FilterValue = "all" | "new" | "contacted" | "demo" | "won" | "lost";

const FILTER_OPTIONS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "new", label: "Nuevos" },
  { value: "contacted", label: "Contactados" },
  { value: "demo", label: "Demo" },
  { value: "won", label: "Ganados" },
  { value: "lost", label: "Perdidos" },
];

const STATUS_LABEL: Record<PlatformLeadRow["status"], { text: string; variant: "primary" | "secondary" | "warning" | "success" | "danger" }> = {
  new: { text: "Nuevo", variant: "primary" },
  contacted: { text: "Contactado", variant: "secondary" },
  demo_scheduled: { text: "Demo agendada", variant: "warning" },
  demo_completed: { text: "Demo realizada", variant: "warning" },
  won: { text: "Ganado", variant: "success" },
  lost: { text: "Perdido", variant: "danger" },
};

function matchesFilter(status: PlatformLeadRow["status"], filter: FilterValue): boolean {
  if (filter === "all") return true;
  if (filter === "demo") return status === "demo_scheduled" || status === "demo_completed";
  return status === filter;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function PlatformLeadsTable({ leads }: { leads: PlatformLeadRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");

  const filtered = leads.filter((l) => {
    if (!matchesFilter(l.status, filter)) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    return (
      l.contact_name.toLowerCase().includes(q) ||
      l.club_name.toLowerCase().includes(q) ||
      l.city.toLowerCase().includes(q) ||
      l.whatsapp.includes(q)
    );
  });

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
          <input
            type="text"
            placeholder="Buscar por nombre, club, ciudad o WhatsApp..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-4 rounded-xl border border-white/10 bg-white/5 text-base md:text-sm text-white placeholder:text-brand-muted/60 focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary/50 hover:border-white/20 transition-colors"
          />
        </div>
        <FilterDropdown
          label="Estado"
          value={filter}
          defaultValue="all"
          options={FILTER_OPTIONS}
          onChange={setFilter}
        />
      </div>

      {leads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl bg-brand-surface border border-white/10">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-3">
            <Handshake className="w-5 h-5 text-brand-muted" />
          </div>
          <p className="text-sm font-medium text-white mb-1">Aún no hay solicitudes de demo.</p>
          <p className="text-xs text-brand-muted">
            Las solicitudes enviadas desde /demo aparecerán aquí.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl bg-brand-surface border border-white/10">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-3">
            <Handshake className="w-5 h-5 text-brand-muted" />
          </div>
          <p className="text-sm font-medium text-white mb-1">Sin resultados</p>
          <p className="text-xs text-brand-muted">Ningún prospecto coincide con los filtros actuales.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-brand-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-brand-muted uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Prospecto</th>
                <th className="px-4 py-3 font-medium">Club</th>
                <th className="px-4 py-3 font-medium">Ciudad</th>
                <th className="px-4 py-3 font-medium text-right">Canchas</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => {
                const badge = STATUS_LABEL[lead.status];
                return (
                  <tr
                    key={lead.id}
                    onClick={() => router.push(`/platform/leads/${lead.id}`)}
                    className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <p className="text-white font-medium whitespace-nowrap">{lead.contact_name}</p>
                      <p className="text-xs text-brand-muted">{lead.whatsapp}</p>
                    </td>
                    <td className="px-4 py-3 text-white whitespace-nowrap">{lead.club_name}</td>
                    <td className="px-4 py-3 text-brand-muted whitespace-nowrap">{lead.city}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-white">
                      {lead.number_of_courts ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={badge.variant} size="sm">{badge.text}</Badge>
                    </td>
                    <td className="px-4 py-3 text-brand-muted whitespace-nowrap">
                      {formatDate(lead.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
