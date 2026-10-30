import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cx } from "./class-names";

export type CheckboxProps = Omit<ComponentPropsWithoutRef<"input">, "type">;

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, ...props },
  ref,
) {
  return <input ref={ref} type="checkbox" className={cx("ui-checkbox", className)} {...props} />;
});
