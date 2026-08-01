"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Menu, X, ChevronDown } from "lucide-react";
import { RegisterMenu } from "@/components/features/marketing/RegisterMenu";

const navLinks = [
  { label: "Características", href: "#features" },
  { label: "Cómo funciona", href: "#como-funciona" },
  { label: "Explorar clubes", href: "/clubs" },
  { label: "Contacto", href: "#contacto" },
];

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 lg:gap-3 shrink-0">
      <Image
        src="/branding/logo-icon2.png"
        alt="MiPadelClub"
        width={48}
        height={48}
        className="h-9 w-9 sm:h-10 sm:w-10 lg:h-12 lg:w-12 object-contain"
        priority
      />
      <span className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight leading-none select-none">
        <span className="text-brand-primary" style={{ fontSize: "0.78em", letterSpacing: "-0.04em" }}>Mi</span>
        <span className="text-white">Padel</span>
        <span className="text-brand-primary">Club</span>
      </span>
    </Link>
  );
}

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-brand-bg/80 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 lg:h-20 items-center justify-between">

          <Brand />

          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-brand-muted hover:text-white transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/auth/login"
              className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:border-white/30 hover:bg-white/5 transition-colors"
            >
              Iniciar sesión
            </Link>
            <RegisterMenu
              align="right"
              triggerClassName="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-bg hover:bg-brand-primary/90 transition-colors"
              triggerContent={
                <>
                  Registrarme
                  <ChevronDown className="h-3.5 w-3.5" />
                </>
              }
            />
          </div>

          <button
            className="md:hidden text-white p-1"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menú"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-white/10 bg-brand-surface">
          <div className="px-4 py-5 flex flex-col gap-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-brand-muted hover:text-white transition-colors"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/auth/login"
              className="rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-white text-center hover:border-white/30 transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              Iniciar sesión
            </Link>
            <RegisterMenu
              align="left"
              triggerClassName="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-primary px-4 py-2.5 text-sm font-semibold text-brand-bg hover:bg-brand-primary/90 transition-colors"
              triggerContent={
                <>
                  Registrarme
                  <ChevronDown className="h-3.5 w-3.5" />
                </>
              }
            />
          </div>
        </div>
      )}
    </header>
  );
}
