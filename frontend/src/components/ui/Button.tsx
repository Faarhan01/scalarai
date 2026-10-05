import React from "react";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "success" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  children?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = "primary",
      size = "md",
      isLoading = false,
      icon,
      iconPosition = "left",
      className = "",
      disabled,
      ...props
    },
    ref
  ) => {
    const variantClass = {
      primary: "btn-primary",
      secondary: "btn-secondary",
      success: "btn-success",
      danger: "btn-danger",
      ghost: "btn-ghost",
    }[variant];

    const sizeClass = {
      sm: "btn-sm",
      md: "",
      lg: "btn-lg",
    }[size];

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`btn ${variantClass} ${sizeClass} ${className}`}
        {...props}
      >
        {isLoading && (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        )}
        {!isLoading && icon && iconPosition === "left" && icon}
        {children}
        {!isLoading && icon && iconPosition === "right" && icon}
      </button>
    );
  }
);

Button.displayName = "Button";
