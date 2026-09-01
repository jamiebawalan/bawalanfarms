import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from "react";

/**
 * The whole component kit.
 *
 * shadcn/ui was the suggested route, but it would have brought a dozen Radix
 * packages for what this app actually uses: buttons, fields, chips, cards and
 * one dialog. Native <dialog> and <details> handle the interactive parts with
 * real accessibility built in. One person has to keep this alive a year from
 * now, and this is less to keep alive.
 *
 * Every tappable thing here is at least 48px tall. The primary controls are
 * 56px, because the farm manager is using this standing up, one-handed.
 */

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// --- layout ----------------------------------------------------------------

export function Page({ title, subtitle, action, children }: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-5">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-ink-soft">{subtitle}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </main>
  );
}

export function Card({ title, action, children, className }: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "mb-4 rounded-(--radius-card) border-2 border-line bg-paper p-4",
        className,
      )}
    >
      {title ? (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-soft">
            {title}
          </h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * A card that starts closed, with its headline on the lid.
 *
 * The Plan screen had grown to five full sections and several screens of
 * scrolling on a phone held in one hand at the edge of a field. Collapsing them
 * only helps if the closed state still says something, so each summary carries
 * the number the section exists to report — the whole page is then readable
 * without opening anything, and opening one is a deliberate act.
 */
export function Section({
  title, summary, tone, defaultOpen = false, children,
}: {
  title: string;
  /** The one figure worth seeing without opening it. */
  summary?: ReactNode;
  tone?: "warn" | "danger";
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="mb-4 overflow-hidden rounded-2xl border-2 border-line bg-paper"
    >
      <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block font-bold">{title}</span>
          {summary !== undefined ? (
            <span
              className={cx(
                "block text-sm",
                tone === "danger" ? "font-semibold text-danger"
                  : tone === "warn" ? "font-semibold text-warn"
                  : "text-ink-soft",
              )}
            >
              {summary}
            </span>
          ) : null}
        </span>
        <svg
          width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          strokeLinejoin="round" aria-hidden
          className="shrink-0 text-ink-soft transition-transform [details[open]_&]:rotate-180"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="border-t-2 border-line px-4 py-3">{children}</div>
    </details>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-ink-soft">{children}</p>;
}

// --- buttons ---------------------------------------------------------------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger";
  size?: "lg" | "md";
};

export function Button({
  variant = "primary", size = "lg", className, ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold",
        "transition-colors disabled:opacity-50 disabled:pointer-events-none",
        size === "lg" ? "min-h-14 px-5 text-lg" : "min-h-12 px-4",
        variant === "primary" && "bg-brand text-white active:bg-brand-strong",
        variant === "secondary" &&
          "border-2 border-line-strong bg-paper text-ink active:bg-paper-sunk",
        variant === "quiet" && "text-brand underline underline-offset-4",
        variant === "danger" && "bg-danger text-white",
        className,
      )}
    />
  );
}

// --- fields ----------------------------------------------------------------

export function Field({ label, hint, error, children, htmlFor }: {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="mb-5">
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-sm font-bold uppercase tracking-wide text-ink-soft"
      >
        {label}
      </label>
      {children}
      {hint && !error ? <p className="mt-1.5 text-sm text-ink-soft">{hint}</p> : null}
      {error ? (
        <p role="alert" className="mt-1.5 text-sm font-semibold text-danger">{error}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={cx(
        "min-h-14 w-full rounded-xl border-2 border-line-strong bg-paper px-4",
        // 17px or larger, or iOS zooms the viewport on focus.
        "text-lg text-ink placeholder:text-ink-soft",
        className,
      )}
    />
  );
}

/** A big numeric field. inputMode="decimal" gets the number pad, not the keyboard. */
export function AmountInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Input
      inputMode="decimal"
      autoComplete="off"
      {...rest}
      className={cx("tabular text-2xl font-semibold", className)}
    />
  );
}

// --- chips -----------------------------------------------------------------

/**
 * The chip is load-bearing. Typing "24/2" or "17, 18" into a plot text field is
 * what let Excel silently convert thirteen rows into dates. A chip cannot be
 * mistyped, so the corruption is structurally impossible rather than merely
 * discouraged.
 */
export function Chip({
  // Defaulted rather than left undefined so aria-pressed is always present.
  // A toggle that only announces itself when pressed is not announcing itself.
  selected = false, children, className, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...rest}
      className={cx(
        "min-h-12 min-w-12 rounded-xl border-2 px-3 font-semibold tabular",
        "transition-colors",
        selected
          ? "border-brand bg-brand text-white"
          : "border-line-strong bg-paper text-ink active:bg-paper-sunk",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function ChipGroup({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

// --- feedback --------------------------------------------------------------

export function Note({ tone = "info", children }: {
  tone?: "info" | "warn" | "danger" | "good";
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        "mb-4 rounded-xl border-2 px-4 py-3 text-sm font-medium",
        tone === "info" && "border-line bg-paper-sunk text-ink",
        tone === "warn" && "border-warn bg-warn-tint text-warn",
        tone === "danger" && "border-danger bg-danger-tint text-danger",
        tone === "good" && "border-brand bg-brand-tint text-brand-strong",
      )}
    >
      {children}
    </div>
  );
}

export function Money({ centavos, className, signed, precise }: {
  centavos: number;
  className?: string;
  signed?: boolean;
  /** Keep the centavos. Only for per-plant and per-fruit figures. */
  precise?: boolean;
}) {
  const tone = !signed ? "" : centavos < 0 ? "text-money-down" : "text-money-up";
  return (
    <span className={cx("tabular font-semibold", tone, className)}>
      {formatPesoInline(centavos, precise === true)}
    </span>
  );
}

function formatPesoInline(centavos: number, precise: boolean): string {
  if (!Number.isFinite(centavos)) return "—";
  const dp = precise ? 2 : 0;
  return new Intl.NumberFormat("en-PH", {
    style: "currency", currency: "PHP",
    minimumFractionDigits: dp, maximumFractionDigits: dp,
  }).format(precise ? centavos / 100 : Math.round(centavos / 100));
}

/** A labelled figure. The unit of every report screen. */
export function Stat({ label, value, tone, hint }: {
  label: string;
  value: ReactNode;
  tone?: "up" | "down";
  hint?: ReactNode;
}) {
  return (
    <div className="rounded-xl border-2 border-line bg-paper-sunk px-3 py-2.5">
      <div className="text-xs font-bold uppercase tracking-wide text-ink-soft">{label}</div>
      <div
        className={cx(
          "tabular mt-0.5 text-xl font-bold",
          tone === "up" && "text-money-up",
          tone === "down" && "text-money-down",
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-xs text-ink-soft">{hint}</div> : null}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{children}</div>;
}

/** A proportion bar for cost breakdowns. Labelled, never colour-only. */
export function Bar({ fraction, tone = "brand" }: {
  fraction: number;
  tone?: "brand" | "warn";
}) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-paper-sunk">
      <div
        className={cx("h-full rounded-full", tone === "warn" ? "bg-warn" : "bg-brand")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
