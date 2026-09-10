import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Comercial v2 / Fase 3 — job diario que hace avanzar los 3 vencimientos
// del ciclo comercial (ver run_commercial_lifecycle_transitions en
// 20261115000007_commercial_payments.sql para la regla exacta). Configurado
// en vercel.json; Vercel firma cada invocación con
// `Authorization: Bearer ${CRON_SECRET}` cuando esa variable de entorno
// existe — verificado contra la documentación oficial de Vercel Cron Jobs.
// Sin CRON_SECRET configurada, esta ruta rechaza toda invocación (nunca
// "abierta por defecto").
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[commercial-lifecycle cron] CRON_SECRET no configurada — rechazando por seguridad");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    console.error("[commercial-lifecycle cron] SUPABASE_SERVICE_ROLE_KEY no configurada");
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }

  // run_commercial_lifecycle_transitions added in 20261115000007, not yet
  // in generated types until `npm run types:generate` runs against a DB
  // with this migration applied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin.rpc as any)("run_commercial_lifecycle_transitions");

  if (error) {
    console.error("[commercial-lifecycle cron] run_commercial_lifecycle_transitions falló:", error);
    return NextResponse.json({ error: "transition_failed" }, { status: 500 });
  }

  const result = data?.[0] ?? null;
  console.log("[commercial-lifecycle cron] transiciones aplicadas:", result);

  return NextResponse.json({ ok: true, result }, { status: 200 });
}
