import Footer from "@/components/layout/Footer";

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Footer />
    </>
  );
}
