import Footer from "@/components/layout/Footer";

// Cubre /clubs, /clubs/[slug] y /clubs/create — ninguna tiene sidebar ni
// tab bar fija, así que el Footer global no necesita ningún ajuste de
// espacio especial.
export default function ClubsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Footer />
    </>
  );
}
