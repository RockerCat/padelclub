import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils/cn";

type BrandLogoSize = "sm" | "md" | "lg";

// Identidad completa de Mi Pádel Club — isotipo circular + wordmark
// "MiPadelClub" — extraída de Navbar (Landing) para que cualquier página
// pública/global fuera del contexto de un club (Login, Registro, Crear
// club, /clubs) pueda mostrar la MISMA marca completa en vez de un
// wordmark de texto suelto, sin duplicar la imagen ni el markup. `size`
// cubre los tres contextos reales que hoy la necesitan: "lg" es el tamaño
// responsive exacto que Navbar ya usaba (Landing, sin cambios visuales),
// "md" es para el encabezado centrado de una tarjeta de autenticación, y
// "sm" para una barra superior compacta (p. ej. el top bar de /clubs).
//
// Nunca se usa dentro de /[club]/... — ahí la identidad visible es la del
// CLUB (ClubHeader/AppNav), nunca la de Mi Pádel Club.
const ICON_SIZE: Record<BrandLogoSize, string> = {
  sm: "h-7 w-7",
  md: "h-10 w-10",
  lg: "h-9 w-9 sm:h-10 sm:w-10 lg:h-12 lg:w-12",
};

const TEXT_SIZE: Record<BrandLogoSize, string> = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-xl sm:text-2xl lg:text-3xl",
};

const GAP: Record<BrandLogoSize, string> = {
  sm: "gap-1.5",
  md: "gap-2",
  lg: "gap-2.5 lg:gap-3",
};

interface BrandLogoProps {
  size?: BrandLogoSize;
  className?: string;
  priority?: boolean;
}

export function BrandLogo({ size = "md", className, priority }: BrandLogoProps) {
  return (
    <Link href="/" className={cn("inline-flex items-center shrink-0", GAP[size], className)}>
      <Image
        src="/branding/logo-icon2.png"
        alt="MiPadelClub"
        width={48}
        height={48}
        className={cn(ICON_SIZE[size], "object-contain")}
        priority={priority}
      />
      <span className={cn(TEXT_SIZE[size], "font-extrabold tracking-tight leading-none select-none")}>
        <span className="text-brand-primary" style={{ fontSize: "0.78em", letterSpacing: "-0.04em" }}>
          Mi
        </span>
        <span className="text-white">Padel</span>
        <span className="text-brand-primary">Club</span>
      </span>
    </Link>
  );
}
