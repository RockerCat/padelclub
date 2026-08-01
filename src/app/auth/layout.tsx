import Footer from "@/components/layout/Footer";

// /auth/login y /auth/signup no tienen sidebar ni tab bar fija (son
// pantallas de una sola tarjeta centrada) — el Footer global simplemente
// se agrega después del contenido, sin ningún ajuste de espacio especial.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Footer />
    </>
  );
}
