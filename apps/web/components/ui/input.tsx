import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cx } from "./class-names";

export type InputProps = ComponentPropsWithoutRef<"input">;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cx("ui-input", className)} {...props} />;
});
