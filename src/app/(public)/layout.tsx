import Footer from "@/components/layout/Footer";

// La página pública de un club (/[slug]) — sin sidebar ni tab bar fija, el
// Footer global no necesita ningún ajuste de espacio especial.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Footer />
    </>
  );
}
