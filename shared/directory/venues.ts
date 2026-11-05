// Directorio de establecimientos de pádel ("Dónde jugar") — lógica pura
// compartida (tipos, mapeo de RPCs jsonb, normalización, enlaces seguros,
// validación de cortesía y errores). El servidor revalida todo
// (20261117000001_padel_venues_directory.sql); aquí nada es autoritativo.
//
// Un establecimiento del directorio NO es un club del SaaS: no tiene
// propietario, reservas, horarios, precios ni disponibilidad. `club` solo
// existe cuando la ficha está vinculada a un club SaaS visible.

export type PadelVenueStatus = "draft" | "published" | "unpublished";

export interface PadelVenueClubRef {
  id: string;
  name: string;
  slug: string;
  visibility: string;
}

export interface PadelVenue {
  id: string;
  name: string;
  department: string;
  municipality: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  mapsUrl: string | null;
  phone: string | null;
  whatsapp: string | null;
  verifiedAt: string | null;
  club: PadelVenueClubRef | null;
}

/** Lugar del directorio tal como lo ve un partido abierto. */
export interface OpenMatchVenue extends PadelVenue {
  /** false = la ficha fue despublicada: solo nombre y municipio, sin contacto. */
  isPublished: boolean;
}

export interface PadelVenueAdmin extends Omit<PadelVenue, "club"> {
  status: PadelVenueStatus;
  sourceLabel: string | null;
  sourceUrl: string | null;
  internalNotes: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  clubId: string | null;
  club: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    archived: boolean;
    pendingClaim: boolean;
    visibility: string;
  } | null;
  matchCount: number;
}

export interface VenueDuplicateCandidate {
  id: string;
  name: string;
  municipality: string;
  department: string;
  address: string | null;
  status: PadelVenueStatus;
  reason: "same_name" | "similar_name" | "same_address" | "same_phone";
}

export interface ClubDuplicateCandidate {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  linkedVenueId: string | null;
}

export interface VenueDuplicates {
  venues: VenueDuplicateCandidate[];
  clubs: ClubDuplicateCandidate[];
}

// ─── Mapeo ──────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : v == null ? fallback : String(v));
const nstr = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const nnum = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

function mapClubRef(raw: unknown): PadelVenueClubRef | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Row;
  const slug = nstr(r.slug);
  if (!slug) return null;
  return { id: str(r.id), name: str(r.name), slug, visibility: str(r.visibility, "private") };
}

export function mapPadelVenue(raw: unknown): PadelVenue | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Row;
  const id = nstr(r.id);
  if (!id) return null;
  return {
    id,
    name: str(r.name),
    department: str(r.department),
    municipality: str(r.municipality),
    address: nstr(r.address),
    latitude: nnum(r.latitude),
    longitude: nnum(r.longitude),
    // Defensa en profundidad: aunque el servidor ya valida, nunca se
    // renderiza un enlace que no pase la misma regla.
    mapsUrl: isAllowedMapsUrl(nstr(r.maps_url)) ? nstr(r.maps_url) : null,
    phone: isColombianPhone(nstr(r.phone)) ? nstr(r.phone) : null,
    whatsapp: isColombianPhone(nstr(r.whatsapp)) ? nstr(r.whatsapp) : null,
    verifiedAt: nstr(r.verified_at),
    club: mapClubRef(r.club),
  };
}

export function mapPadelVenueList(raw: unknown): PadelVenue[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(mapPadelVenue).filter((v): v is PadelVenue => v !== null);
}

export function mapOpenMatchVenue(raw: unknown): OpenMatchVenue | null {
  const base = mapPadelVenue(raw);
  if (!base) return null;
  const isPublished = (raw as Row).is_published === true;
  if (!isPublished) {
    // Ficha despublicada: se conserva la referencia histórica sin contacto.
    return {
      ...base,
      address: null,
      latitude: null,
      longitude: null,
      mapsUrl: null,
      phone: null,
      whatsapp: null,
      club: null,
      isPublished: false,
    };
  }
  return { ...base, isPublished: true };
}

export function mapPadelVenueAdmin(raw: unknown): PadelVenueAdmin | null {
  const base = mapPadelVenue(raw);
  if (!base) return null;
  const r = raw as Row;
  const club = r.club && typeof r.club === "object" ? (r.club as Row) : null;
  const status = str(r.status);
  return {
    ...base,
    status: (status === "published" || status === "unpublished" ? status : "draft") as PadelVenueStatus,
    sourceLabel: nstr(r.source_label),
    sourceUrl: isSafeHttpsUrl(nstr(r.source_url)) ? nstr(r.source_url) : null,
    internalNotes: nstr(r.internal_notes),
    publishedAt: nstr(r.published_at),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
    clubId: nstr(r.club_id),
    club: club
      ? {
          id: str(club.id),
          name: str(club.name),
          slug: str(club.slug),
          isActive: club.is_active === true,
          archived: club.archived === true,
          pendingClaim: club.pending_claim === true,
          visibility: str(club.visibility, "private"),
        }
      : null,
    matchCount: Number(r.match_count ?? 0) || 0,
  };
}

export function mapPadelVenueAdminList(raw: unknown): PadelVenueAdmin[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(mapPadelVenueAdmin).filter((v): v is PadelVenueAdmin => v !== null);
}

export function mapVenueDuplicates(raw: unknown): VenueDuplicates {
  const r = raw && typeof raw === "object" ? (raw as Row) : {};
  const venues = Array.isArray(r.venues)
    ? (r.venues as Row[]).map((v) => ({
        id: str(v.id),
        name: str(v.name),
        municipality: str(v.municipality),
        department: str(v.department),
        address: nstr(v.address),
        status: (str(v.status) || "draft") as PadelVenueStatus,
        reason: (str(v.reason) || "similar_name") as VenueDuplicateCandidate["reason"],
      }))
    : [];
  const clubs = Array.isArray(r.clubs)
    ? (r.clubs as Row[]).map((c) => ({
        id: str(c.id),
        name: str(c.name),
        slug: str(c.slug),
        city: nstr(c.city),
        linkedVenueId: nstr(c.linked_venue_id),
      }))
    : [];
  return { venues, clubs };
}

// ─── Directorio unificado (/clubs) ──────────────────────────────────────

/** Lo mínimo de un club SaaS que el directorio necesita para fusionar. */
export interface DirectoryClubLike {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
}

export type DirectoryListEntry<C extends DirectoryClubLike> = {
  id: string;
  name: string;
  department: string | null;
  municipality: string | null;
  latitude: number | null;
  longitude: number | null;
} & ({ kind: "club"; club: C } | { kind: "venue"; venue: PadelVenue });

/**
 * Un establecimiento aparece UNA sola vez: un club SaaS visible es una
 * entrada "club" (su ficha vinculada, si existe, solo completa ubicación
 * faltante); una ficha sin club visible es una entrada "venue" neutral.
 * Orden alfabético (es).
 */
export function mergeDirectoryEntries<C extends DirectoryClubLike>(clubs: C[], venues: PadelVenue[]): DirectoryListEntry<C>[] {
  const clubIds = new Set(clubs.map((c) => c.id));
  const linked = new Map<string, PadelVenue>();
  for (const v of venues) if (v.club && clubIds.has(v.club.id)) linked.set(v.club.id, v);

  const entries: DirectoryListEntry<C>[] = clubs.map((club) => {
    const v = linked.get(club.id);
    const hasClubCoords = club.latitude != null && club.longitude != null;
    return {
      kind: "club" as const,
      club,
      id: club.id,
      name: club.name,
      department: club.state ?? v?.department ?? null,
      municipality: club.city ?? v?.municipality ?? null,
      latitude: hasClubCoords ? club.latitude : (v?.latitude ?? null),
      longitude: hasClubCoords ? club.longitude : (v?.longitude ?? null),
    };
  });
  for (const v of venues) {
    if (v.club && clubIds.has(v.club.id)) continue;
    entries.push({
      kind: "venue",
      venue: v,
      id: v.id,
      name: v.name,
      department: v.department,
      municipality: v.municipality,
      latitude: v.latitude,
      longitude: v.longitude,
    });
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

// ─── Normalización ──────────────────────────────────────────────────────

/** Misma clave que _open_match_city_key en SQL: minúsculas, sin tildes, espacios colapsados. */
export function placeKey(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

const CO_PHONE_RE = /^57(3\d{9}|60\d{8})$/;

export function isColombianPhone(value: string | null | undefined): boolean {
  return !!value && CO_PHONE_RE.test(value);
}

/**
 * "+57 310 123 4567" → "573101234567"; "(608) 740 1234" → "576087401234".
 * "" → null. Devuelve "invalid" si no es un móvil (3xx) o fijo (60x)
 * colombiano reconocible — misma regla que _padel_venue_phone en SQL.
 */
export function normalizeColombianPhone(raw: string | null | undefined): string | null | "invalid" {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (!/^\+?[0-9 ().-]+$/.test(value)) return "invalid";
  let digits = value.replace(/\D/g, "");
  if (digits.length === 10) digits = `57${digits}`;
  return CO_PHONE_RE.test(digits) ? digits : "invalid";
}

/** "573101234567" → "310 123 4567"; "576087401234" → "(608) 740 1234". */
export function formatColombianPhone(stored: string): string {
  const local = stored.startsWith("57") ? stored.slice(2) : stored;
  if (/^3\d{9}$/.test(local)) return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  if (/^60\d{8}$/.test(local)) return `(${local.slice(0, 3)}) ${local.slice(3, 6)} ${local.slice(6)}`;
  return stored;
}

const UNSAFE_URL_CHARS = /[\s<>"'`]/;

export function isSafeHttpsUrl(url: string | null | undefined): boolean {
  if (!url || url.length > 500 || UNSAFE_URL_CHARS.test(url) || !url.startsWith("https://")) return false;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

const MAPS_URL_RE =
  /^https:\/\/((www\.)?google\.com(\.co)?\/maps|maps\.google\.com(\.co)?\/|maps\.app\.goo\.gl\/|goo\.gl\/maps\/|(www\.|ul\.)?waze\.com\/|(www\.)?openstreetmap\.org\/)/i;

/** Solo https a proveedores de mapas conocidos — misma regla que _padel_venue_maps_url_ok. */
export function isAllowedMapsUrl(url: string | null | undefined): boolean {
  return isSafeHttpsUrl(url) && MAPS_URL_RE.test(url as string);
}

// ─── Enlaces de contacto / ubicación ────────────────────────────────────

/**
 * Destino de navegación: el enlace validado de la ficha; si no hay, una
 * búsqueda de Google Maps por coordenadas o por dirección pública. Nunca
 * scraping ni API: solo un enlace que abre la app de mapas del usuario.
 */
export function venueMapsHref(venue: Pick<PadelVenue, "mapsUrl" | "latitude" | "longitude" | "name" | "address" | "municipality" | "department">): string | null {
  if (venue.mapsUrl) return venue.mapsUrl;
  if (venue.latitude != null && venue.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${venue.latitude},${venue.longitude}`;
  }
  if (venue.address) {
    const q = [venue.name, venue.address, venue.municipality, venue.department].filter(Boolean).join(", ");
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }
  return null;
}

export function venueTelHref(phone: string | null): string | null {
  return isColombianPhone(phone) ? `tel:+${phone}` : null;
}

/**
 * WhatsApp comercial del establecimiento con un mensaje neutral. Número
 * fijo → wa.me/<phone>?text= (ver CLAUDE.md → WhatsApp Share Principles),
 * codificado una sola vez.
 */
export function venueWhatsappHref(whatsapp: string | null, message?: string): string | null {
  if (!isColombianPhone(whatsapp)) return null;
  const text = message ?? "Hola, encontré su establecimiento en el directorio de Mi Pádel Club. Quisiera preguntar por una cancha.";
  return `https://wa.me/${whatsapp}?text=${encodeURIComponent(text)}`;
}

/** Corrección o retiro de una ficha: canal de contacto existente de Mi Pádel Club. */
export const DIRECTORY_CONTACT_PHONE = "573173672033";

export function directoryCorrectionHref(venueName?: string): string {
  const text = venueName
    ? `Hola, quiero solicitar una corrección o el retiro de la ficha "${venueName}" del directorio de Mi Pádel Club.`
    : "Hola, quiero solicitar una corrección o el retiro de una ficha del directorio de Mi Pádel Club.";
  return `https://wa.me/${DIRECTORY_CONTACT_PHONE}?text=${encodeURIComponent(text)}`;
}

// ─── Regiones ───────────────────────────────────────────────────────────

/** Región inicial del directorio. La base no está limitada a ella. */
export const DIRECTORY_DEFAULT_DEPARTMENT = "Boyacá";

export const COLOMBIA_DEPARTMENTS = [
  "Amazonas", "Antioquia", "Arauca", "Atlántico", "Bogotá D.C.", "Bolívar", "Boyacá", "Caldas",
  "Caquetá", "Casanare", "Cauca", "Cesar", "Chocó", "Córdoba", "Cundinamarca", "Guainía",
  "Guaviare", "Huila", "La Guajira", "Magdalena", "Meta", "Nariño", "Norte de Santander",
  "Putumayo", "Quindío", "Risaralda", "San Andrés y Providencia", "Santander", "Sucre",
  "Tolima", "Valle del Cauca", "Vaupés", "Vichada",
] as const;

// ─── Formulario SUPERADMIN (cortesía; el servidor revalida) ─────────────

export interface PadelVenueFormValues {
  name: string;
  department: string;
  municipality: string;
  address: string;
  latitude: string;
  longitude: string;
  mapsUrl: string;
  phone: string;
  whatsapp: string;
  sourceLabel: string;
  sourceUrl: string;
  verifiedAt: string;
  internalNotes: string;
}

export const EMPTY_VENUE_FORM: PadelVenueFormValues = {
  name: "",
  department: DIRECTORY_DEFAULT_DEPARTMENT,
  municipality: "",
  address: "",
  latitude: "",
  longitude: "",
  mapsUrl: "",
  phone: "",
  whatsapp: "",
  sourceLabel: "",
  sourceUrl: "",
  verifiedAt: "",
  internalNotes: "",
};

export function venueToFormValues(v: PadelVenueAdmin): PadelVenueFormValues {
  return {
    name: v.name,
    department: v.department,
    municipality: v.municipality,
    address: v.address ?? "",
    latitude: v.latitude != null ? String(v.latitude) : "",
    longitude: v.longitude != null ? String(v.longitude) : "",
    mapsUrl: v.mapsUrl ?? "",
    phone: v.phone ? formatColombianPhone(v.phone) : "",
    whatsapp: v.whatsapp ? formatColombianPhone(v.whatsapp) : "",
    sourceLabel: v.sourceLabel ?? "",
    sourceUrl: v.sourceUrl ?? "",
    verifiedAt: v.verifiedAt ?? "",
    internalNotes: v.internalNotes ?? "",
  };
}

export interface PadelVenueWriteInput {
  name: string;
  department: string;
  municipality: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  mapsUrl: string | null;
  phone: string | null;
  whatsapp: string | null;
  sourceLabel: string | null;
  sourceUrl: string | null;
  verifiedAt: string | null;
  internalNotes: string | null;
}

const clean = (s: string) => s.trim().replace(/\s+/g, " ");
const orNull = (s: string) => (clean(s) === "" ? null : clean(s));

/** Valida y convierte. Devuelve un mensaje de error en español o el input listo. */
export function parseVenueForm(
  v: PadelVenueFormValues,
  todayStr: string
): { ok: true; input: PadelVenueWriteInput } | { ok: false; error: string } {
  const name = clean(v.name);
  if (name.length < 2 || name.length > 120) return { ok: false, error: "Escribe el nombre comercial (2 a 120 caracteres)." };
  const department = clean(v.department);
  if (department.length < 2 || department.length > 60) return { ok: false, error: "Elige el departamento." };
  const municipality = clean(v.municipality);
  if (municipality.length < 2 || municipality.length > 60) return { ok: false, error: "Escribe el municipio." };
  const address = orNull(v.address);
  if (address && (address.length < 3 || address.length > 200)) return { ok: false, error: "La dirección debe tener entre 3 y 200 caracteres." };

  const latRaw = v.latitude.trim().replace(",", ".");
  const lngRaw = v.longitude.trim().replace(",", ".");
  let latitude: number | null = null;
  let longitude: number | null = null;
  if (latRaw || lngRaw) {
    latitude = Number(latRaw);
    longitude = Number(lngRaw);
    if (!latRaw || !lngRaw || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return { ok: false, error: "Coordenadas inválidas: escribe latitud y longitud (ambas) o deja las dos vacías." };
    }
    latitude = Math.round(latitude * 1e6) / 1e6;
    longitude = Math.round(longitude * 1e6) / 1e6;
  }

  const mapsUrl = orNull(v.mapsUrl);
  if (mapsUrl && !isAllowedMapsUrl(mapsUrl)) {
    return { ok: false, error: "El enlace de mapa debe ser https de Google Maps, Waze u OpenStreetMap." };
  }
  const phone = normalizeColombianPhone(v.phone);
  if (phone === "invalid") return { ok: false, error: "Teléfono inválido: usa un celular (3xx) o fijo (60x) colombiano de 10 dígitos." };
  const whatsapp = normalizeColombianPhone(v.whatsapp);
  if (whatsapp === "invalid") return { ok: false, error: "WhatsApp inválido: usa un número colombiano de 10 dígitos." };

  const sourceLabel = orNull(v.sourceLabel);
  if (sourceLabel && (sourceLabel.length < 3 || sourceLabel.length > 200)) return { ok: false, error: "Describe la fuente (3 a 200 caracteres)." };
  const sourceUrl = orNull(v.sourceUrl);
  if (sourceUrl && !isSafeHttpsUrl(sourceUrl)) return { ok: false, error: "El enlace de la fuente debe empezar por https:// y no tener espacios." };
  const verifiedAt = v.verifiedAt.trim() || null;
  if (verifiedAt && (!/^\d{4}-\d{2}-\d{2}$/.test(verifiedAt) || verifiedAt > todayStr)) {
    return { ok: false, error: "La fecha de verificación no puede ser futura." };
  }
  const internalNotes = v.internalNotes.trim() || null;
  if (internalNotes && internalNotes.length > 1000) return { ok: false, error: "Las notas internas admiten hasta 1000 caracteres." };

  return {
    ok: true,
    input: { name, department, municipality, address, latitude, longitude, mapsUrl, phone, whatsapp, sourceLabel, sourceUrl, verifiedAt, internalNotes },
  };
}

/** Qué falta para poder publicar (vacío = publicable). */
export function missingForPublication(v: { address: string | null; sourceLabel: string | null; verifiedAt: string | null }): string[] {
  const missing: string[] = [];
  if (!v.address) missing.push("dirección");
  if (!v.sourceLabel) missing.push("fuente de los datos");
  if (!v.verifiedAt) missing.push("fecha de verificación");
  return missing;
}

export function venueStatusLabel(status: PadelVenueStatus): string {
  return status === "published" ? "Publicado" : status === "unpublished" ? "No publicado" : "Borrador";
}

// ─── Errores del servidor → mensajes ────────────────────────────────────

const ERROR_MESSAGES: Record<string, string> = {
  "Not authorized": "Solo SUPERADMIN puede administrar el directorio.",
  invalid_name: "Escribe el nombre comercial (2 a 120 caracteres).",
  invalid_department: "Elige el departamento.",
  invalid_municipality: "Escribe el municipio.",
  invalid_address: "La dirección debe tener entre 3 y 200 caracteres.",
  invalid_coordinates: "Coordenadas inválidas.",
  invalid_maps_url: "El enlace de mapa debe ser https de Google Maps, Waze u OpenStreetMap.",
  invalid_phone: "Teléfono inválido.",
  invalid_whatsapp: "WhatsApp inválido.",
  invalid_source: "Describe la fuente (3 a 200 caracteres).",
  invalid_source_url: "El enlace de la fuente debe empezar por https://.",
  invalid_verified_at: "La fecha de verificación no puede ser futura.",
  invalid_notes: "Las notas internas admiten hasta 1000 caracteres.",
  invalid_status: "Estado inválido.",
  duplicate_venue: "Ya existe un establecimiento con ese nombre en ese municipio.",
  not_publishable: "Para publicar faltan dirección, fuente o fecha de verificación.",
  venue_not_found: "Este establecimiento no existe.",
  club_not_found: "Ese club no existe.",
  club_already_linked: "Ese club ya está vinculado a otro establecimiento.",
  already_linked: "Este establecimiento ya está vinculado a un club.",
  venue_has_history: "Solo se puede borrar un borrador nunca publicado y sin referencias. Despublícalo en su lugar.",
  // Partidos abiertos
  venue_unavailable: "Ese establecimiento ya no está disponible en el directorio.",
  venue_city_mismatch: "El establecimiento debe estar en la ciudad del partido.",
};

export function venueErrorMessage(error: { message?: string | null } | null | undefined): string {
  const msg = (error?.message ?? "").trim();
  if (ERROR_MESSAGES[msg]) return ERROR_MESSAGES[msg];
  if (msg.includes("clubs_slug_key") || msg.includes("duplicate key")) return "Ese identificador de club ya está en uso.";
  if (msg.includes("clubs_slug_format")) return "Identificador: solo letras minúsculas, números y guiones.";
  return "No pudimos completar la acción. Intenta de nuevo.";
}
