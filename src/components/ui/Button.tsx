import { forwardRef } from "react";
import { cn } from "@/lib/utils/cn";
import { Spinner } from "./Spinner";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50 disabled:opacity-50 disabled:cursor-not-allowed",
          {
            // primary — lime on dark
            "bg-brand-primary text-brand-bg hover:brightness-110 active:brightness-95":
              variant === "primary",
            // secondary — outline
            "border border-white/20 text-white hover:border-white/40 hover:bg-white/5 active:bg-white/10":
              variant === "secondary",
            // ghost — no border
            "text-brand-muted hover:text-white hover:bg-white/5":
              variant === "ghost",
            // danger
            "bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25":
              variant === "danger",
            // success
            "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25":
              variant === "success",
          },
          {
            "h-8 px-3 text-sm": size === "sm",
            "h-10 px-4 text-sm": size === "md",
            "h-12 px-6 text-base": size === "lg",
          },
          className
        )}
        {...props}
      >
        {loading && <Spinner size="sm" />}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
