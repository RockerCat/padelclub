"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { resolveClubAccess } from "@/lib/clubAccess";
import { getWompiConfig, WOMPI_CHECKOUT_URL } from "@/lib/wompi/config";
import { buildCheckoutIntegritySignature, amountInCents } from "../../../../../shared/commercial/wompi";

export type InitiateCheckoutResult =
  | { error: string }
  | {
      checkoutUrl: string;
      fields: {
        publicKey: string;
        currency: string;
        amountInCents: number;
        reference: string;
        signature: string;
        redirectUrl: string;
      };
    };

// Deriva el origen real de la request (protocolo + host) en vez de un
// dominio hardcodeado — Wompi Sandbox necesita un redirect-url realmente
// alcanzable, y esto funciona igual en local, en un preview deploy de
// Vercel (QA de Sandbox) y en producción, sin mantener una variable de
// entorno aparte solo para esto.
async function getRequestOrigin(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "mipadel.club";
  return `${proto}://${host}`;
}

// Inicia un checkout real de Wompi para la suscripción del club. Server
// Action, nunca expone el integrity secret al cliente — la firma se calcula
// acá mismo y solo el resultado (un hash) viaja al componente cliente, que
// simplemente auto-envía un <form> normal a Wompi (nunca fetch/JS SDK).
//
// Restringido al mismo criterio que create_pending_payment: OWNER real
// (club_members.role='OWNER'), nunca acceso elevado de SUPERADMIN ni ADMIN/
// PLAYER — mover dinero real nunca debe depender de un bypass operativo.
export async function initiateSubscriptionCheckout(
  clubId: string,
  clubSlug: string
): Promise<InitiateCheckoutResult> {
  const supabase = await createClient();
  const access = await resolveClubAccess(supabase, clubId);

  if (!access.authorized || access.role !== "OWNER" || access.isSuperadminAccess) {
    return { error: "Solo el propietario del club puede iniciar un pago." };
  }

  const wompiConfig = getWompiConfig();
  if (!wompiConfig) {
    return { error: "Los pagos todavía no están configurados. Intenta más tarde." };
  }

  // create_pending_payment added in 20261115000007, not yet in generated
  // types until `npm run types:generate` runs against a DB with this
  // migration applied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("create_pending_payment", { p_club_id: clubId });
  const row = data?.[0];
  if (error || !row) {
    console.error("[initiateSubscriptionCheckout] create_pending_payment failed:", { clubId, error });
    if (error?.code === "P0002") {
      return { error: "Este club todavía no tiene una suscripción comercial inicializada." };
    }
    return { error: "No se pudo iniciar el pago. Intenta de nuevo." };
  }

  const reference: string = row.provider_reference;
  const amount: number = row.amount;
  const currency: string = row.currency;
  const cents = amountInCents(amount);

  const signature = buildCheckoutIntegritySignature({
    reference,
    amountInCents: cents,
    currency,
    integritySecret: wompiConfig.integritySecret,
  });

  const origin = await getRequestOrigin();
  const redirectUrl = `${origin}/${clubSlug}/subscription/payment-result?ref=${encodeURIComponent(reference)}`;

  return {
    checkoutUrl: WOMPI_CHECKOUT_URL,
    fields: {
      publicKey: wompiConfig.publicKey,
      currency,
      amountInCents: cents,
      reference,
      signature,
      redirectUrl,
    },
  };
}
