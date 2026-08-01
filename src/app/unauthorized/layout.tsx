import Footer from "@/components/layout/Footer";

export default function UnauthorizedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Footer />
    </>
  );
}
