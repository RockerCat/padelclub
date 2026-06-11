"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

export async function checkSlugAvailability(
  slug: string
): Promise<{ available: boolean }> {
  if (!slug || slug.length < 3) return { available: false };

  const supabase = await createClient();
  const { data } = await supabase
    .from("clubs")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  return { available: !data };
}

export type CreateClubState = {
  error?: string;
  fieldErrors?: {
    name?: string;
    slug?: string;
  };
};

export async function createClub(
  _prevState: CreateClubState,
  formData: FormData
): Promise<CreateClubState> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    console.log("[createClub] step=auth", { userId: user?.id, userError });

    if (userError || !user) {
      redirect("/auth/login");
    }

    const name = (formData.get("name") as string | null)?.trim() ?? "";
    const slug = (formData.get("slug") as string | null)?.trim() ?? "";
    const rawVisibility = formData.get("visibility") as string | null;
    const visibility = rawVisibility === "private" ? "private" : "public";

    console.log("[createClub] step=input", { name, slug });

    const fieldErrors: CreateClubState["fieldErrors"] = {};

    if (!name || name.length < 2) {
      fieldErrors.name = "El nombre debe tener al menos 2 caracteres.";
    }
    if (!slug) {
      fieldErrors.slug = "El identificador es obligatorio.";
    } else if (slug.length < 3) {
      fieldErrors.slug = "El identificador debe tener al menos 3 caracteres.";
    } else if (!SLUG_REGEX.test(slug)) {
      fieldErrors.slug =
        "Solo letras minúsculas, números y guiones. Debe empezar y terminar con letra o número.";
    }

    if (Object.keys(fieldErrors).length > 0) {
      return { fieldErrors };
    }

    // Diagnostic: verify profile row exists
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user!.id)
      .maybeSingle();

    console.log("[createClub] step=profile_lookup", {
      profileId: profile?.id ?? null,
      profileExists: !!profile,
      profileError: profileError
        ? { message: profileError.message, code: profileError.code }
        : null,
    });

    // Call atomic SECURITY DEFINER function (inserts club + owner membership)
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "create_club_with_owner",
      { p_name: name, p_slug: slug, p_visibility: visibility }
    );

    console.log("[createClub] step=rpc", {
      rpcData,
      rpcError: rpcError
        ? {
            message: rpcError.message,
            code: rpcError.code,
            details: rpcError.details,
            hint: rpcError.hint,
          }
        : null,
    });

    if (rpcError) {
      if (rpcError.code === "23505") {
        return {
          fieldErrors: { slug: "Este identificador ya está en uso. Elige otro." },
        };
      }
      return {
        error: `[${rpcError.code}] ${rpcError.message}`,
      };
    }

    const club = rpcData?.[0];

    console.log("[createClub] step=result", {
      club,
      hasId: !!club?.id,
      hasSlug: !!club?.slug,
      redirectTarget: club ? `/${club.slug}/admin/settings` : null,
    });

    if (!club?.slug) {
      return {
        error: `RPC devolvió datos inesperados: ${JSON.stringify(rpcData)}`,
      };
    }

    const target = `/${club.slug}/admin/settings`;
    console.log("[createClub] step=redirect →", target);
    redirect(target);
  } catch (err: unknown) {
    // Next.js redirect() throws NEXT_REDIRECT internally — must re-throw it.
    // Without this, the redirect is swallowed and the client gets "Failed to fetch".
    if (
      typeof err === "object" &&
      err !== null &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }

    // Any other uncaught exception: log and return serializable state.
    console.error("[createClub] FATAL uncaught exception:", err);
    return {
      error: `Error inesperado: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
