import type { ComponentPropsWithoutRef } from "react";
import { cx } from "./class-names";

export type AlertVariant = "neutral" | "info" | "success" | "warning" | "danger";

export type AlertProps = ComponentPropsWithoutRef<"div"> & {
  variant?: AlertVariant;
};

export function Alert({ className, role = "status", variant = "neutral", ...props }: AlertProps) {
  return (
    <div
      className={cx("ui-alert", `ui-alert--${variant}`, className)}
      role={role}
      {...props}
    />
  );
}
