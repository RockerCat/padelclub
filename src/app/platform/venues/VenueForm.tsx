"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { getBogotaNow } from "@/lib/utils/bogotaDatetime";
import {
  COLOMBIA_DEPARTMENTS,
  parseVenueForm,
  type PadelVenueFormValues,
  type VenueDuplicates,
} from "@/lib/directory";
import { findVenueDuplicatesAction, saveVenueAction } from "./actions";

const selectClass =
  "h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-base md:text-sm text-white hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-brand-primary/50 [&>option]:bg-brand-surface";

const REASON_LABEL: Record<string, string> = {
  same_name: "mismo nombre",
  similar_name: "nombre parecido",
  same_address: "misma dirección",
  same_phone: "mismo teléfono",
};

interface Props {
  venueId: string | null;
  initial: PadelVenueFormValues;
}

// Un solo formulario para crear y editar. Solo información comercial
// pública y verificable: sin logos, fotos, reseñas ni descripciones
// copiadas (no existen campos para ellas). Antes de crear se muestran
// posibles duplicados (fichas y clubes SaaS) para vincular en vez de
// duplicar.
export function VenueForm({ venueId, initial }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<PadelVenueFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dupes, setDupes] = useState<VenueDuplicates>({ venues: [], clubs: [] });
  const today = getBogotaNow().dateStr;

  function set<K extends keyof PadelVenueFormValues>(key: K, value: PadelVenueFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
  }

  const dupKey = [values.name, values.department, values.municipality, values.address, values.phone, values.whatsapp].join("|");
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const result = await findVenueDuplicatesAction(
        {
          name: values.name,
          department: values.department,
          municipality: values.municipality,
          address: values.address,
          phone: values.phone,
          whatsapp: values.whatsapp,
        },
        venueId
      );
      if (!cancelled) setDupes(result);
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // dupKey resume todos los campos que alimentan la búsqueda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dupKey, venueId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseVenueForm(values, today);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    setError(null);
    const result = await saveVenueAction(venueId, values);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (!venueId) {
      router.push(`/platform/venues/${result.data.id}`);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  const departments: string[] = COLOMBIA_DEPARTMENTS.includes(values.department as (typeof COLOMBIA_DEPARTMENTS)[number])
    ? [...COLOMBIA_DEPARTMENTS]
    : [values.department, ...COLOMBIA_DEPARTMENTS].filter(Boolean);
  const hasDupes = dupes.venues.length > 0 || dupes.clubs.length > 0;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-white">Identidad y ubicación</h2>
        <Input id="v-name" label="Nombre comercial" value={values.name} onChange={(e) => set("name", e.target.value)} maxLength={120} required />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="v-dept" className="text-sm font-medium text-white/80">Departamento</label>
            <select id="v-dept" className={selectClass} value={values.department} onChange={(e) => set("department", e.target.value)}>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <Input
            id="v-muni"
            label="Municipio"
            value={values.municipality}
            onChange={(e) => set("municipality", e.target.value)}
            maxLength={60}
            required
            hint="Igual que lo escriben los jugadores (ej. Tunja, Duitama)."
          />
        </div>
        <Input id="v-address" label="Dirección" value={values.address} onChange={(e) => set("address", e.target.value)} maxLength={200} hint="Obligatoria para publicar." />
        <div className="grid grid-cols-2 gap-4">
          <Input id="v-lat" label="Latitud (opcional)" inputMode="decimal" value={values.latitude} onChange={(e) => set("latitude", e.target.value)} placeholder="5.535000" />
          <Input id="v-lng" label="Longitud (opcional)" inputMode="decimal" value={values.longitude} onChange={(e) => set("longitude", e.target.value)} placeholder="-73.367000" />
        </div>
        <Input
          id="v-maps"
          label="Enlace de mapa (opcional)"
          type="url"
          value={values.mapsUrl}
          onChange={(e) => set("mapsUrl", e.target.value)}
          placeholder="https://maps.app.goo.gl/…"
          hint="Solo https de Google Maps, Waze u OpenStreetMap. No inventes coordenadas: si no están verificadas, déjalas vacías."
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-white">Contacto comercial (opcional)</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input id="v-phone" label="Teléfono" inputMode="tel" value={values.phone} onChange={(e) => set("phone", e.target.value)} placeholder="608 740 1234" />
          <Input id="v-wa" label="WhatsApp" inputMode="tel" value={values.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} placeholder="310 123 4567" />
        </div>
        <p className="text-xs text-brand-muted -mt-2">
          Solo números anunciados públicamente como contacto del establecimiento. Nunca números personales.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-white">Procedencia</h2>
        <Input
          id="v-source"
          label="Fuente de los datos"
          value={values.sourceLabel}
          onChange={(e) => set("sourceLabel", e.target.value)}
          maxLength={200}
          placeholder="Ej. Instagram oficial, ficha pública de Google Maps, llamada al establecimiento"
          hint="Obligatoria para publicar."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input id="v-source-url" label="Enlace de la fuente (opcional)" type="url" value={values.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value)} placeholder="https://…" />
          <Input id="v-verified" label="Verificado el" type="date" max={today} value={values.verifiedAt} onChange={(e) => set("verifiedAt", e.target.value)} hint="Obligatoria para publicar." />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="v-notes" className="text-sm font-medium text-white/80">Notas internas (solo SUPERADMIN)</label>
          <textarea
            id="v-notes"
            rows={2}
            maxLength={1000}
            value={values.internalNotes}
            onChange={(e) => set("internalNotes", e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-base md:text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
          />
        </div>
      </section>

      {hasDupes && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-amber-300">
            <AlertTriangle className="h-4 w-4" /> Posibles duplicados
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-white/80">
            {dupes.venues.map((d) => (
              <li key={d.id}>
                <Link href={`/platform/venues/${d.id}`} className="text-brand-primary hover:underline">{d.name}</Link>
                {" · "}{d.municipality} · {REASON_LABEL[d.reason] ?? d.reason}
              </li>
            ))}
            {dupes.clubs.map((c) => (
              <li key={c.id}>
                Club SaaS <Link href={`/platform/clubs/${c.id}`} className="text-brand-primary hover:underline">{c.name}</Link>
                {c.linkedVenueId ? " · ya vinculado a una ficha" : " · vincúlalo a la ficha en lugar de duplicarlo"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
      )}
      {saved && !error && <p className="text-sm text-emerald-400">Cambios guardados.</p>}

      <Button type="submit" size="lg" loading={saving} className="w-full sm:w-auto sm:self-end">
        {venueId ? "Guardar cambios" : "Crear borrador"}
      </Button>
    </form>
  );
}
