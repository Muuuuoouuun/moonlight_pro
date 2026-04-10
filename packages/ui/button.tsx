import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children?: ReactNode;
}

const baseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 42,
  padding: "0 16px",
  borderRadius: 999,
  border: "1px solid transparent",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  transition: "transform 160ms ease, background 160ms ease, border-color 160ms ease",
};

const variantStyles: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: "#084734",
    color: "#ffffff",
    boxShadow: "0 14px 24px rgba(8, 71, 52, 0.18)",
  },
  secondary: {
    background: "#ffffff",
    color: "#17362d",
    borderColor: "rgba(8, 71, 52, 0.12)",
  },
  ghost: {
    background: "transparent",
    color: "#60726c",
  },
};

export function Button({
  variant = "primary",
  children,
  type = "button",
  style,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      style={{
        ...baseStyle,
        ...variantStyles[variant],
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}
