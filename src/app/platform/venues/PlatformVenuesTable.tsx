"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Search } from "lucide-react";
import { Badge, FilterDropdown } from "@/components/ui";
import { placeKey, venueStatusLabel, type PadelVenueAdmin, type PadelVenueStatus } from "@/lib/directory";

const ALL = "all";

const STATUS_OPTIONS: { value: PadelVenueStatus | typeof ALL; label: string }[] = [
  { value: ALL, label: "Todos" },
  { value: "draft", label: "Borradores" },
  { value: "published", label: "Publicados" },
  { value: "unpublished", label: "No publicados" },
];

const STATUS_VARIANT: Record<PadelVenueStatus, "warning" | "success" | "default"> = {
  draft: "warning",
  published: "success",
  unpublished: "default",
};

function options(values: string[], allLabel: string) {
  const byKey = new Map<string, string>();
  for (const v of values) if (v && !byKey.has(placeKey(v))) byKey.set(placeKey(v), v);
  return [
    { value: ALL, label: allLabel },
    ...Array.from(byKey.entries())
      .sort((a, b) => a[1].localeCompare(b[1], "es"))
      .map(([value, label]) => ({ value, label })),
  ];
}

export function PlatformVenuesTable({ venues }: { venues: PadelVenueAdmin[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState<string>(ALL);
  const [municipality, setMunicipality] = useState<string>(ALL);
  const [status, setStatus] = useState<PadelVenueStatus | typeof ALL>(ALL);

  const departmentOptions = useMemo(() => options(venues.map((v) => v.department), "Todos"), [venues]);
  const municipalityOptions = useMemo(
    () =>
      options(
        venues.filter((v) => department === ALL || placeKey(v.department) === department).map((v) => v.municipality),
        "Todos"
      ),
    [venues, department]
  );

  const q = placeKey(search);
  const filtered = venues.filter(
    (v) =>
      (!q || placeKey(v.name).includes(q)) &&
      (department === ALL || placeKey(v.department) === department) &&
      (municipality === ALL || placeKey(v.municipality) === municipality) &&
      (status === ALL || v.status === status)
  );

  const counts = {
    published: venues.filter((v) => v.status === "published").length,
    draft: venues.filter((v) => v.status === "draft").length,
    linked: venues.filter((v) => v.clubId).length,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Publicados", value: counts.published },
          { label: "Borradores", value: counts.draft },
          { label: "Vinculados a club", value: counts.linked },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-white/10 bg-brand-surface px-3 py-2.5">
            <p className="text-lg font-bold text-white tabular-nums">{s.value}</p>
            <p className="text-[11px] text-brand-muted">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted/60 pointer-events-none" />
        <input
          type="search"
          placeholder="Buscar por nombre"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-brand-surface border border-white/10 text-base md:text-sm text-white placeholder:text-brand-muted/60 focus:outline-none focus:border-white/30"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <FilterDropdown
          label="Departamento"
          value={department}
          defaultValue={ALL}
          options={departmentOptions}
          onChange={(v) => {
            setDepartment(v);
            setMunicipality(ALL);
          }}
        />
        <FilterDropdown label="Municipio" value={municipality} defaultValue={ALL} options={municipalityOptions} onChange={setMunicipality} />
        <FilterDropdown label="Estado" value={status} defaultValue={ALL} options={STATUS_OPTIONS} onChange={setStatus} />
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center rounded-2xl border border-dashed border-white/10">
          <p className="text-sm text-brand-muted">
            {venues.length === 0 ? "Todavía no hay establecimientos. Crea el primero con datos públicos verificados." : "Sin resultados con estos filtros."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => router.push(`/platform/venues/${v.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-brand-surface border border-white/10 hover:border-white/20 text-left transition-colors"
              >
                <MapPin className="w-4 h-4 shrink-0 text-brand-muted" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{v.name}</p>
                  <p className="text-xs text-brand-muted truncate">
                    {v.municipality}, {v.department}
                    {v.address ? ` · ${v.address}` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant={STATUS_VARIANT[v.status]} size="sm">{venueStatusLabel(v.status)}</Badge>
                  {v.club && <span className="text-[10px] text-brand-primary">Club SaaS: {v.club.slug}</span>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
