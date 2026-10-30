import type { ComponentPropsWithoutRef } from "react";
import { cx } from "./class-names";

export type BadgeVariant = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

export type BadgeProps = ComponentPropsWithoutRef<"span"> & {
  variant?: BadgeVariant;
};

export function Badge({ className, variant = "neutral", ...props }: BadgeProps) {
  return <span className={cx("ui-badge", `ui-badge--${variant}`, className)} {...props} />;
}
