import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { mapPublicCommercialOffer, type PublicCommercialOffer, type PublicCommercialOfferRow } from "../../shared/commercial/offer";

export * from "../../shared/commercial/offer";

// Una sola lectura por request (la landing la usa en generateMetadata y en
// la página; /demo igual) — `cache` deduplica ambas llamadas.
//
// null cuando la RPC falla o aún no existe en la base (migración
// 20261115000011 sin aplicar): los llamadores muestran copy sin cifras en
// vez de inventar un precio o una duración.
export const getPublicCommercialOffer = cache(async (): Promise<PublicCommercialOffer | null> => {
  const supabase = await createClient();
  // get_public_commercial_offer added in 20261115000011, not yet in
  // generated types until types:generate runs against a DB with this
  // migration applied — same documented gap as get_platform_commercial_settings.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("get_public_commercial_offer");
  if (error) return null;
  return mapPublicCommercialOffer((data as PublicCommercialOfferRow[] | null)?.[0]);
});
