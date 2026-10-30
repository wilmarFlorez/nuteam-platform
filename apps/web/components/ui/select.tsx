import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cx } from "./class-names";

export type SelectProps = ComponentPropsWithoutRef<"select">;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, ...props },
  ref,
) {
  return <select ref={ref} className={cx("ui-select", className)} {...props} />;
});
