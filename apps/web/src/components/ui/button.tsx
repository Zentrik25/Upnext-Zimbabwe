import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** `inverse` is for black bands (white button, black text); `outline-inverse` is its quiet partner. */
export type ButtonVariant = "primary" | "secondary" | "inverse" | "outline-inverse";
/** `search` is the 39px control that sits inside the search group. */
export type ButtonSize = "standard" | "search";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const base =
  "inline-flex rounded-control items-center justify-center border text-ctl font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-60";
const variants: Record<ButtonVariant, string> = {
  primary:
    "border-accent-solid bg-accent-solid text-on-accent hover:border-accent-solid-hover hover:bg-accent-solid-hover",
  secondary: "border-border-strong bg-transparent text-secondary-text hover:bg-accent/5",
  inverse: "border-white bg-white text-brand-dark hover:border-line hover:bg-line",
  "outline-inverse": "border-brand-dark-text bg-transparent text-white hover:bg-white/10",
};
const sizes: Record<ButtonSize, string> = {
  standard: "min-h-control px-3 py-[7px]",
  search: "min-h-search sm:rounded-l-none border-0 px-[15px] py-2 max-sm:min-h-field",
};

export function Button({
  variant = "primary",
  size = "standard",
  type = "button",
  className,
  ...props
}: ButtonProps) {
  return <button type={type} className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}

export type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: ButtonVariant;
  href: string;
};

/** A link that looks exactly like a `Button` (navigation, not an action). */
export function ButtonLink({ variant = "primary", className, ...props }: ButtonLinkProps) {
  return <a className={cn(base, variants[variant], sizes.standard, className)} {...props} />;
}
