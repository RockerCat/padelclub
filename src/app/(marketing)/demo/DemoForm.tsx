"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { submitDemoLead, type DemoLeadState } from "./actions";
import { Button, Input } from "@/components/ui";

const initialState: DemoLeadState = {};

// Todos los campos son controlados (value + onChange) — React/Next.js
// resetea los <input> no controlados de un <form action={...}> después de
// cada envío (incluso uno fallido por validación), lo que borraría todo lo
// ya escrito solo porque, por ejemplo, faltó marcar el consentimiento.
// Controlar el valor evita esa pérdida.
export function DemoForm() {
  const [state, action, pending] = useActionState(submitDemoLead, initialState);
  const [contactName, setContactName] = useState("");
  const [clubName, setClubName] = useState("");
  const [city, setCity] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [numberOfCourts, setNumberOfCourts] = useState("");
  const [consent, setConsent] = useState(false);

  if (state.success) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15">
          <CheckCircle2 className="h-6 w-6 text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">¡Gracias!</h2>
        <p className="text-sm text-brand-muted leading-relaxed">
          Recibimos tu solicitud para conocer Mi Pádel Club. Nos pondremos en
          contacto contigo por WhatsApp para coordinar la demo.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <Input
        name="contact_name"
        label="Nombre"
        type="text"
        placeholder="Tu nombre completo"
        required
        maxLength={150}
        value={contactName}
        onChange={(e) => setContactName(e.target.value)}
        error={state.fieldErrors?.contactName}
      />

      <Input
        name="club_name"
        label="Club"
        type="text"
        placeholder="Nombre de tu club"
        required
        maxLength={150}
        value={clubName}
        onChange={(e) => setClubName(e.target.value)}
        error={state.fieldErrors?.clubName}
      />

      <Input
        name="city"
        label="Ciudad"
        type="text"
        placeholder="Ciudad donde opera tu club"
        required
        maxLength={100}
        value={city}
        onChange={(e) => setCity(e.target.value)}
        error={state.fieldErrors?.city}
      />

      <Input
        name="whatsapp"
        label="WhatsApp"
        type="tel"
        placeholder="Ej. 3001234567"
        required
        value={whatsapp}
        onChange={(e) => setWhatsapp(e.target.value)}
        hint={
          state.fieldErrors?.whatsapp
            ? undefined
            : "Te contactaremos por WhatsApp para coordinar la demo."
        }
        error={state.fieldErrors?.whatsapp}
      />

      <Input
        name="number_of_courts"
        label="Número de canchas (opcional)"
        type="number"
        min={1}
        max={100}
        placeholder="Ej. 4"
        value={numberOfCourts}
        onChange={(e) => setNumberOfCourts(e.target.value)}
      />

      {/* Honeypot — oculto de la vista y del flujo de tabulación; un
          visitante real nunca lo ve ni lo llena. tabIndex=-1 +
          autoComplete="off" reducen aún más la chance de que un gestor de
          contraseñas/autofill lo toque por accidente. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="company_website">No llenar este campo</label>
        <input
          id="company_website"
          name="company_website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <label className="flex items-start gap-3 mt-2 cursor-pointer">
        <input
          type="checkbox"
          name="consent"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded accent-brand-primary cursor-pointer shrink-0"
        />
        <span className="text-xs text-brand-muted leading-relaxed">
          Acepto el tratamiento de mis datos para que Mi Pádel Club pueda
          contactarme acerca de esta solicitud. Ver{" "}
          <Link href="/privacy" className="text-white hover:text-brand-primary transition-colors" target="_blank">
            Política de Privacidad
          </Link>
          .
        </span>
      </label>
      {state.fieldErrors?.consent && (
        <p className="text-xs text-red-400 -mt-2">{state.fieldErrors.consent}</p>
      )}

      {state.error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          {state.error}
        </p>
      )}

      <Button type="submit" loading={pending} size="lg" className="w-full mt-2">
        Solicitar demo
      </Button>
    </form>
  );
}
