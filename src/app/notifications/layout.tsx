import Footer from "@/components/layout/Footer";

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Footer />
    </>
  );
}
