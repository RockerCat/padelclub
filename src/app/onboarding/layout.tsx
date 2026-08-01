import Footer from "@/components/layout/Footer";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Footer />
    </>
  );
}
