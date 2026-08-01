import Link from "next/link";
import Image from "next/image";

// Footer global — presente en toda la aplicación (pública y privada), no
// solo en el marketing. Deliberadamente mínimo (CLAUDE.md-style: "discreto,
// limpio, poca altura") — misma filosofía visual que el footer de SolarDesk
// (marca + firma + copyright en una sola franja horizontal) pero sin copiar
// su contenido: sin enlaces de navegación, sin redes sociales, sin
// elementos decorativos. Cada layout de nivel superior lo renderiza
// explícitamente (nunca desde el layout raíz) porque el shell de la app
// autenticada ((app)/[club] y (app)/profile) tiene su propia tab bar mobile
// fija que necesita reservar espacio exactamente alrededor de este footer
// — ver esos layouts.
export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-brand-surface">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-3">
            <Link href="/" className="flex items-center gap-1.5 shrink-0">
              <Image
                src="/branding/logo-icon2.png"
                alt="MiPadelClub"
                width={40}
                height={40}
                className="h-5 w-5 object-contain"
              />
              <span className="text-sm font-extrabold tracking-tight leading-none select-none">
                <span className="text-brand-primary" style={{ fontSize: "0.78em", letterSpacing: "-0.04em" }}>Mi</span>
                <span className="text-white">Padel</span>
                <span className="text-brand-primary">Club</span>
              </span>
            </Link>
            <p className="text-xs text-brand-muted">
              Hecho en Colombia 🇨🇴 por AlexSosa.me
            </p>
          </div>

          <p className="text-xs text-brand-muted">
            © {new Date().getFullYear()} Mi Pádel Club. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
