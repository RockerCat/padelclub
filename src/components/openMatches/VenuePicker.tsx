"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Check, MapPin, Search, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { placeKey, type PadelVenue } from "@/lib/directory";
import { listVenuesForCityAction } from "@/app/(player)/partidos/actions";

// Selector opcional de establecimiento del directorio para un partido
// abierto. Muestra solo fichas publicadas de la ciudad escrita; el jugador
// puede no elegir ninguna y escribir el lugar libremente (o dejarlo por
// definir). Elegir un establecimiento NUNCA reserva cancha ni confirma
// disponibilidad — el interruptor "Ya reservé la cancha" sigue aparte.

export interface PickedVenue {
  id: string;
  name: string;
  municipality: string;
  address: string | null;
  /** false si la ficha fue despublicada después de elegirse (solo en edición). */
  isPublished: boolean;
}

interface Props {
  city: string;
  value: PickedVenue | null;
  onChange: (venue: PickedVenue | null) => void;
}

function toPicked(v: PadelVenue): PickedVenue {
  return { id: v.id, name: v.name, municipality: v.municipality, address: v.address, isPublished: true };
}

export function VenuePicker({ city, value, onChange }: Props) {
  const cityKey = placeKey(city);
  const [results, setResults] = useState<{ key: string; venues: PadelVenue[] } | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (cityKey.length < 2) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const venues = await listVenuesForCityAction(city);
      if (!cancelled) setResults({ key: cityKey, venues });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // city se lee dentro del timeout; cityKey decide cuándo recargar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityKey]);

  const loading = cityKey.length >= 2 && results?.key !== cityKey;
  const venues = useMemo(() => (results?.key === cityKey ? results.venues : []), [results, cityKey]);
  const q = placeKey(query);
  const visible = q ? venues.filter((v) => placeKey(v.name).includes(q)) : venues;

  if (value) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-brand-primary/40 bg-brand-primary/10 p-3">
        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{value.name}</p>
          <p className="truncate text-xs text-brand-muted">
            {[value.address, value.municipality].filter(Boolean).join(" · ")}
          </p>
          {!value.isPublished && (
            <p className="mt-1 text-xs text-amber-300/90">Ya no aparece en el directorio; puedes mantenerlo o cambiarlo.</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs text-brand-muted hover:bg-white/5 hover:text-white"
          aria-label="Quitar establecimiento"
        >
          <X className="h-3.5 w-3.5" /> Cambiar
        </button>
      </div>
    );
  }

  if (cityKey.length < 2) {
    return <p className="text-xs text-brand-muted">Escribe la ciudad para ver establecimientos del directorio.</p>;
  }

  if (loading) {
    return <p className="text-xs text-brand-muted">Buscando establecimientos en {city.trim()}…</p>;
  }

  if (venues.length === 0) {
    return (
      <p className="text-xs text-brand-muted">
        Aún no hay establecimientos del directorio en {city.trim()}. Escribe el lugar abajo o déjalo por definir.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {venues.length > 5 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted/60" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar establecimiento"
            aria-label="Buscar establecimiento"
            className="h-10 w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 text-base text-white placeholder:text-brand-muted/60 focus:border-white/30 focus:outline-none md:text-sm"
          />
        </div>
      )}
      <ul className="flex max-h-60 flex-col gap-1.5 overflow-y-auto" role="listbox" aria-label="Establecimientos">
        {visible.map((v) => (
          <li key={v.id}>
            <button
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => onChange(toPicked(v))}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border border-white/10 px-3 py-2.5 text-left transition-colors",
                "hover:border-brand-primary/50 hover:bg-white/[0.03]"
              )}
            >
              <MapPin className="h-4 w-4 shrink-0 text-brand-muted" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white">{v.name}</span>
                {v.address && <span className="block truncate text-xs text-brand-muted">{v.address}</span>}
              </span>
              <Check className="h-4 w-4 shrink-0 text-transparent" />
            </button>
          </li>
        ))}
        {visible.length === 0 && <li className="px-1 py-2 text-xs text-brand-muted">Ningún establecimiento coincide.</li>}
      </ul>
    </div>
  );
}
