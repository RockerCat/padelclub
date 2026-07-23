import Link from "next/link";
import Image from "next/image";

const footerLinks = [
  { label: "Características", href: "#features" },
  { label: "Cómo funciona", href: "#como-funciona" },
  { label: "Contacto", href: "#contacto" },
];

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-brand-surface">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center md:items-start gap-3">
            <div className="flex items-center gap-2">
              <Image
                src="/branding/logo-icon.png"
                alt="MiPadelClub"
                width={40}
                height={40}
                className="h-8 w-8 object-contain"
              />
              <span className="text-lg font-extrabold tracking-tight leading-none select-none">
                <span className="text-brand-primary" style={{ fontSize: "0.78em", letterSpacing: "-0.04em" }}>Mi</span>
                <span className="text-white">Padel</span>
                <span className="text-brand-primary">Club</span>
              </span>
            </div>
            <p className="text-sm text-brand-muted max-w-xs text-center md:text-left">
              El hogar digital de tu club de pádel.
            </p>
          </div>

          <nav className="flex items-center gap-6">
            {footerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-brand-muted hover:text-white transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-8 pt-8 border-t border-white/10 flex justify-center">
          <p className="text-xs text-brand-muted">
            © {new Date().getFullYear()} MiPadelClub. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
