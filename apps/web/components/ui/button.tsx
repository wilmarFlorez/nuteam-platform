import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cx } from "./class-names";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive" | "link";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, size = "md", type = "button", variant = "primary", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cx("ui-button", `ui-button--${variant}`, `ui-button--${size}`, className)}
      type={type}
      {...props}
    />
  );
});
