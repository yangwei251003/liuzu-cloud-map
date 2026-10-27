import Link from "next/link";

export default function NotFound() {
  return (
    <main
      style={{
        display: "grid",
        minHeight: "70dvh",
        placeItems: "center",
        padding: "1.5rem",
      }}
    >
      <section
        aria-labelledby="not-found-title"
        style={{
          width: "min(100%, 38rem)",
          border: "1px solid #c9d7cd",
          borderRadius: "0.875rem",
          background: "#ffffff",
          color: "#173f35",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <p style={{ margin: 0, color: "#76551f", fontSize: "0.875rem", fontWeight: 700 }}>404</p>
        <h1 id="not-found-title" style={{ margin: "0.75rem 0 0", fontSize: "1.5rem" }}>页面未找到</h1>
        <p style={{ margin: "0.75rem 0 0", color: "#466554", lineHeight: 1.7 }}>
          这个地址可能已变更，或暂时不可访问。
        </p>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            minHeight: "3rem",
            alignItems: "center",
            marginTop: "1.5rem",
            borderRadius: "0.625rem",
            background: "#173f35",
            color: "#ffffff",
            fontWeight: 700,
            padding: "0.75rem 1.125rem",
            textDecoration: "none",
          }}
        >
          返回首页
        </Link>
      </section>
    </main>
  );
}
