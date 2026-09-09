"use server";

import { normalizePhone, isValidPhone } from "@/lib/utils/phone";
import { createClient } from "@/lib/supabase/server";

export type DemoLeadState = {
  success?: boolean;
  error?: string;
  fieldErrors?: {
    contactName?: string;
    clubName?: string;
    city?: string;
    whatsapp?: string;
    consent?: string;
  };
};

// Público (anon) — captura de leads del funnel comercial. Nunca crea
// usuario/auth/club/OWNER: solo persiste un commercial_lead vía la RPC
// create_commercial_lead, cuya firma no acepta status/source/notes como
// parámetro (ver 20261115000001_commercial_leads_funnel.sql) — no hay
// forma de que este formulario se autodeclare "won" o escriba notas
// internas, aunque alguien manipule el submit directamente.
export async function submitDemoLead(
  _prevState: DemoLeadState,
  formData: FormData
): Promise<DemoLeadState> {
  const contactName = (formData.get("contact_name") as string | null)?.trim() ?? "";
  const clubName = (formData.get("club_name") as string | null)?.trim() ?? "";
  const city = (formData.get("city") as string | null)?.trim() ?? "";
  const whatsappRaw = (formData.get("whatsapp") as string | null)?.trim() ?? "";
  const courtsRaw = (formData.get("number_of_courts") as string | null)?.trim() ?? "";
  const consent = formData.get("consent") === "on";
  // Honeypot — campo oculto que ningún visitante real ve o llena (ver
  // DemoForm). Un bot que autocompleta todos los campos de un formulario
  // suele llenarlo también.
  const honeypot = (formData.get("company_website") as string | null)?.trim() ?? "";

  const fieldErrors: NonNullable<DemoLeadState["fieldErrors"]> = {};
  if (!contactName) fieldErrors.contactName = "Ingresa tu nombre.";
  if (!clubName) fieldErrors.clubName = "Ingresa el nombre del club.";
  if (!city) fieldErrors.city = "Ingresa la ciudad.";
  if (!whatsappRaw || !isValidPhone(whatsappRaw)) {
    fieldErrors.whatsapp = "Ingresa un número de WhatsApp válido.";
  }
  if (!consent) {
    fieldErrors.consent = "Debes aceptar el tratamiento de tus datos para continuar.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  let numberOfCourts: number | undefined;
  if (courtsRaw) {
    const parsed = parseInt(courtsRaw, 10);
    // Espeja el CHECK de la tabla (BETWEEN 1 AND 100) — 0 no es un número
    // de canchas válido, no solo "sin dato".
    if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 100) numberOfCourts = parsed;
  }

  const whatsapp = normalizePhone(whatsappRaw);

  const supabase = await createClient();
  // create_commercial_lead added in 20261115000001, not yet in generated
  // types until `npm run types:generate` runs against a DB with this
  // migration applied — same documented gap as get_my_profile in
  // src/lib/platformAdminQuery.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)("create_commercial_lead", {
    p_contact_name: contactName,
    p_club_name: clubName,
    p_city: city,
    p_whatsapp: whatsapp,
    p_number_of_courts: numberOfCourts ?? undefined,
    p_privacy_consent: true,
    p_honeypot: honeypot || undefined,
  });

  if (error) {
    return { error: "No pudimos enviar tu solicitud. Intenta de nuevo en unos minutos." };
  }

  return { success: true };
}
