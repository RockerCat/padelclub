import Footer from "@/components/layout/Footer";

// Cubre /clubs/[slug]/* y /clubs/create (el índice /clubs vive en el grupo
// (player) desde "Mi Pádel") — ninguna tiene sidebar ni
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
