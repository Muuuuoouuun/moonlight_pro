export default function EngineNotFoundPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <p style={{ margin: 0, opacity: 0.7, fontSize: "0.9rem" }}>Com_Moon Engine</p>
        <h1 style={{ margin: "12px 0 0", fontSize: "2rem" }}>404</h1>
        <p style={{ margin: "12px 0 0", opacity: 0.82 }}>
          This route does not exist on the engine surface.
        </p>
      </div>
    </main>
  );
}
