import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  // Session refresh only — no DB queries, no club validation.
  // Club membership validation happens inside [club]/layout.tsx (Sprint 1).
  // x-pathname: la ruta solicitada (con query), para que un layout
  // autenticado pueda redirigir a /auth/login?next=<esta ruta> y preservar
  // el enlace profundo (ver src/lib/utils/loginRedirect.ts). Se reconstruye
  // en cada setAll para que los headers reenviados lleven también las
  // cookies refrescadas.
  const withPathname = () => {
    const headers = new Headers(request.headers);
    headers.set("x-pathname", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return headers;
  };
  let response = NextResponse.next({ request: { headers: withPathname() } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set({ name, value, ...options });
          });
          response = NextResponse.next({ request: { headers: withPathname() } });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Must use getUser() — not getSession() — per @supabase/ssr requirements.
  // getUser() validates the token with the Supabase Auth server on every call.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Skip static assets, images, and favicon.
    "/((?!_next/static|_next/image|favicon.ico|branding|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
