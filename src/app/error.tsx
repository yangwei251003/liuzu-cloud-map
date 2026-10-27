"use client";

import Link from "next/link";

type RouteErrorProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

/**
 * Covers pages and nested route segments. Root-layout failures are handled by
 * global-error.tsx because a segment error boundary cannot wrap its own layout.
 */
export default function RouteError({ error, retry }: RouteErrorProps) {
  const hasDiagnosticReference = typeof error.digest === "string" && error.digest.length > 0;

  return (
    <main
      data-testid="route-error-fallback"
      style={{
        display: "grid",
        minHeight: "70dvh",
        placeItems: "center",
        padding: "1.5rem",
      }}
    >
      <section
        aria-labelledby="route-error-title"
        role="alert"
        style={{
          width: "min(100%, 38rem)",
          border: "1px solid #c9d7cd",
          borderRadius: "0.875rem",
          background: "#ffffff",
          color: "#173f35",
          padding: "2rem",
          boxShadow: "0 4px 8px rgb(25 66 54 / 10%)",
        }}
      >
        <p style={{ margin: 0, color: "#76551f", fontSize: "0.875rem", fontWeight: 700 }}>暂时无法继续</p>
        <h1 id="route-error-title" style={{ margin: "0.75rem 0 0", fontSize: "1.5rem" }}>页面遇到了问题</h1>
        <p style={{ margin: "0.75rem 0 0", color: "#466554", lineHeight: 1.7 }}>
          请重试；若问题仍持续，可以返回首页重新开始。
        </p>
        {hasDiagnosticReference ? (
          <p style={{ margin: "0.75rem 0 0", color: "#466554", fontSize: "0.875rem", lineHeight: 1.6 }}>
            系统已生成诊断参考号，联系项目方时可说明发生时间。
          </p>
        ) : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "1.5rem" }}>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              minHeight: "3rem",
              border: 0,
              borderRadius: "0.625rem",
              background: "#173f35",
              color: "#ffffff",
              cursor: "pointer",
              font: "inherit",
              fontWeight: 700,
              padding: "0.75rem 1.125rem",
            }}
          >
            重试
          </button>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              minHeight: "3rem",
              alignItems: "center",
              border: "1px solid #173f35",
              borderRadius: "0.625rem",
              color: "#173f35",
              fontWeight: 700,
              padding: "0.75rem 1.125rem",
              textDecoration: "none",
            }}
          >
            返回首页
          </Link>
        </div>
      </section>
    </main>
  );
}
