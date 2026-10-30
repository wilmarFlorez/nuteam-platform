import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cx } from "./class-names";

export type CardProps = ComponentPropsWithoutRef<"section">;

export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  { className, ...props },
  ref,
) {
  return <section ref={ref} className={cx("ui-card", className)} {...props} />;
});
