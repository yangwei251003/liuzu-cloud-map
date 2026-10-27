import {
  CheckCircle,
  Info,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";
import { SubpageHeader } from "./SubpageHeader";

type PageShellProps = {
  title: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function PageShell({ title, children, className = "", contentClassName = "" }: PageShellProps) {
  return (
    <div className={["app-page-shell", className].filter(Boolean).join(" ")}>
      <SubpageHeader title={title} />
      <main className={["app-page-shell__content", contentClassName].filter(Boolean).join(" ")} data-page-title={title}>
        {children}
      </main>
    </div>
  );
}

type SectionHeaderProps = {
  title: string;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  level?: 1 | 2;
  id?: string;
  className?: string;
};

export function SectionHeader({
  title,
  description,
  meta,
  actions,
  level = 2,
  id,
  className = "",
}: SectionHeaderProps) {
  const Heading = level === 1 ? "h1" : "h2";

  return (
    <div className={["section-header", className].filter(Boolean).join(" ")}>
      <div className="section-header__copy">
        <span className="section-header__brush" aria-hidden="true" />
        {meta ? <div className="section-header__meta">{meta}</div> : null}
        <Heading id={id} className="section-header__title">{title}</Heading>
        {description ? <div className="section-header__description">{description}</div> : null}
      </div>
      {actions ? <div className="section-header__actions">{actions}</div> : null}
    </div>
  );
}

type InterfaceStateProps = {
  kind: "loading" | "empty" | "error" | "success" | "info";
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
};

const stateIcons = {
  empty: Info,
  error: WarningCircle,
  success: CheckCircle,
  info: Info,
} as const;

export function InterfaceState({
  kind,
  title,
  description,
  action,
  compact = false,
  className = "",
}: InterfaceStateProps) {
  if (kind === "loading") {
    return (
      <section
        className={["interface-state interface-state--loading", compact ? "interface-state--compact" : "", className].filter(Boolean).join(" ")}
        aria-busy="true"
        aria-label={title}
        role="status"
      >
        <span className="interface-state__skeleton interface-state__skeleton--short" aria-hidden="true" />
        <span className="interface-state__skeleton" aria-hidden="true" />
        <span className="interface-state__skeleton interface-state__skeleton--medium" aria-hidden="true" />
        <span className="sr-only">{title}</span>
      </section>
    );
  }

  const Icon = stateIcons[kind];
  const role = kind === "error" ? "alert" : "status";

  return (
    <section
      className={["interface-state", `interface-state--${kind}`, compact ? "interface-state--compact" : "", className].filter(Boolean).join(" ")}
      role={role}
    >
      <Icon className="interface-state__icon" size={24} weight="duotone" aria-hidden="true" />
      <div className="interface-state__copy">
        <h2 className="interface-state__title">{title}</h2>
        {description ? <div className="interface-state__description">{description}</div> : null}
      </div>
      {action ? <div className="interface-state__action">{action}</div> : null}
    </section>
  );
}
