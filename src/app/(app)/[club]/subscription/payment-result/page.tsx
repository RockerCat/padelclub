import Link from "next/link";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

interface PaymentResultPageProps {
  params: Promise<{ club: string }>;
  searchParams: Promise<{ ref?: string; id?: string }>;
}

// El redirect de Wompi NUNCA es autoridad de pago (ver documentación oficial
// de Web Checkout: "transaction queries from the frontend are no longer
// supported" — el estado real solo lo confirma el webhook, server-side).
// Esta pantalla únicamente CONSULTA lo que el webhook ya haya procesado a
// través de `ref` (nuestra propia referencia, la que nosotros pusimos en
// redirect-url) — nunca activa, aprueba ni cambia nada por sí misma, y
// nunca confía en `?id=` (el transaction id de Wompi) para decidir nada.
export default async function PaymentResultPage({ params, searchParams }: PaymentResultPageProps) {
  const { club: slug } = await params;
  const { ref } = await searchParams;

  const supabase = await createClient();

  let status: string | null = null;
  if (ref) {
    // get_payment_status added in 20261115000007, not yet in generated
    // types until `npm run types:generate` runs against a DB with this
    // migration applied.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.rpc as any)("get_payment_status", { p_reference: ref });
    status = data?.[0]?.status ?? null;
  }

  const content = (() => {
    if (!ref || !status || status === "pending") {
      return {
        Icon: Clock,
        color: "text-amber-300",
        title: "Verificando tu pago",
        text: "Estamos confirmando el resultado con Wompi. Esto puede tardar unos segundos — puedes refrescar esta página o volver más tarde a Suscripción.",
      };
    }
    if (status === "approved") {
      return {
        Icon: CheckCircle2,
        color: "text-emerald-400",
        title: "Pago aprobado",
        text: "Tu suscripción ya está activa. Ya puedes crear reservas y torneos con normalidad.",
      };
    }
    return {
      Icon: XCircle,
      color: "text-red-400",
      title: "El pago no se completó",
      text: "El pago fue rechazado, anulado o falló. No se realizó ningún cargo a tu suscripción — puedes intentar de nuevo desde Suscripción.",
    };
  })();

  const { Icon, color, title, text } = content;

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5`}>
        <Icon className={`h-6 w-6 ${color}`} />
      </div>
      <h1 className="text-xl font-bold text-white mb-2">{title}</h1>
      <p className="text-sm text-brand-muted leading-relaxed mb-8">{text}</p>
      <Link
        href={`/${slug}/subscription`}
        className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium rounded-xl border border-white/20 text-white hover:border-white/40 hover:bg-white/5 transition-colors"
      >
        Ver Suscripción
      </Link>
    </div>
  );
}
