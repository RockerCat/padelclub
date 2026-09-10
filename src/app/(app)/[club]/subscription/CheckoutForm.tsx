"use client";

import { useRef, useState, useTransition } from "react";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui";
import { initiateSubscriptionCheckout, type InitiateCheckoutResult } from "./actions";

// Nunca usa fetch/JS SDK de Wompi — el flujo real y documentado de Web
// Checkout es un <form method="GET"> normal que redirige el navegador a
// checkout.wompi.co. Este componente solo junta los campos (calculados
// server-side en initiateSubscriptionCheckout, la firma nunca se calcula
// acá) y hace submit() de un form real oculto.
export function CheckoutForm({
  clubId,
  clubSlug,
  label,
}: {
  clubId: string;
  clubSlug: string;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Extract<InitiateCheckoutResult, { fields: unknown }>["fields"] | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await initiateSubscriptionCheckout(clubId, clubSlug);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setFields(result.fields);
      setCheckoutUrl(result.checkoutUrl);
      // El form todavía no existe en el DOM en este mismo tick (el estado
      // recién se está aplicando) — se envía en el próximo render, ver
      // el efecto de abajo... en vez de un useEffect extra, se hace en el
      // siguiente microtask con requestAnimationFrame, después de que
      // React confirme el commit con los campos ya en el DOM.
      requestAnimationFrame(() => formRef.current?.submit());
    });
  }

  return (
    <div>
      <Button type="button" onClick={handleClick} loading={pending} size="lg">
        <CreditCard className="w-4 h-4" />
        {label}
      </Button>

      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mt-3">
          {error}
        </p>
      )}

      {/* Form real, oculto — nunca fetch. method="GET" es el que documenta
          Wompi para Web Checkout. */}
      {fields && checkoutUrl && (
        <form ref={formRef} action={checkoutUrl} method="GET" className="hidden">
          <input type="hidden" name="public-key" value={fields.publicKey} />
          <input type="hidden" name="currency" value={fields.currency} />
          <input type="hidden" name="amount-in-cents" value={fields.amountInCents} />
          <input type="hidden" name="reference" value={fields.reference} />
          <input type="hidden" name="signature:integrity" value={fields.signature} />
          <input type="hidden" name="redirect-url" value={fields.redirectUrl} />
        </form>
      )}
    </div>
  );
}
