import { Suspense } from "react";
import { LoginForm } from "./LoginForm";
import { Spinner } from "@/components/ui";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4">
      <Suspense
        fallback={
          <div className="flex items-center justify-center">
            <Spinner size="md" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
