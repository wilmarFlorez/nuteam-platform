import { cx } from "./class-names";

export type SpinnerProps = {
  className?: string;
  label: string;
  size?: "sm" | "md";
};

export function Spinner({ className, label, size = "md" }: SpinnerProps) {
  return (
    <span className={cx("ui-spinner", `ui-spinner--${size}`, className)} role="status">
      <span className="sr-only">{label}</span>
    </span>
  );
}
