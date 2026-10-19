import React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "brand" | "primary" | "secondary" | "success" | "danger" | "warning" | "info" | "neutral";
  size?: "sm" | "md";
  dot?: boolean;
  pulse?: boolean;
  children: React.ReactNode;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      children,
      variant = "neutral",
      size = "md",
      dot = false,
      pulse = false,
      className = "",
      ...props
    },
    ref
  ) => {
    const variantClass = {
      brand: "badge-brand",
      primary: "badge-brand",
      secondary: "badge-neutral",
      success: "badge-success",
      danger: "badge-danger",
      warning: "badge-warning",
      info: "badge-info",
      neutral: "badge-neutral",
    }[variant];

    const sizeClass = size === "sm" ? "text-[10px] py-0.5 px-1.5" : "text-xs py-1 px-2.5";

    const dotColor = {
      brand: "bg-indigo-400",
      primary: "bg-indigo-400",
      secondary: "bg-slate-400",
      success: "bg-emerald-400",
      danger: "bg-rose-400",
      warning: "bg-amber-400",
      info: "bg-cyan-400",
      neutral: "bg-slate-400",
    }[variant];

    return (
      <span
        ref={ref}
        className={`badge ${variantClass} ${sizeClass} font-mono inline-flex items-center gap-1.5 ${className}`}
        {...props}
      >
        {dot && (
          <span className="relative flex h-1.5 w-1.5">
            {pulse && (
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotColor}`} />
            )}
            <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${dotColor}`} />
          </span>
        )}
        {children}
      </span>
    );
  }
);

Badge.displayName = "Badge";
