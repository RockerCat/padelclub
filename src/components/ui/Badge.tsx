import { cn } from "@/lib/utils/cn";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?:
    | "default"
    | "primary"
    | "secondary"
    | "success"
    | "warning"
    | "danger"
    | "outline";
  size?: "sm" | "md";
}

export function Badge({
  className,
  variant = "default",
  size = "md",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium rounded-full",
        {
          "bg-white/10 text-white/70": variant === "default",
          "bg-brand-primary/15 text-brand-primary border border-brand-primary/25":
            variant === "primary",
          "bg-brand-secondary/15 text-brand-secondary border border-brand-secondary/25":
            variant === "secondary",
          "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25":
            variant === "success",
          "bg-amber-500/15 text-amber-400 border border-amber-500/25":
            variant === "warning",
          "bg-red-500/15 text-red-400 border border-red-500/25":
            variant === "danger",
          "border border-white/20 text-white/60": variant === "outline",
        },
        {
          "text-xs px-2 py-0.5": size === "sm",
          "text-xs px-2.5 py-1": size === "md",
        },
        className
      )}
      {...props}
    />
  );
}
