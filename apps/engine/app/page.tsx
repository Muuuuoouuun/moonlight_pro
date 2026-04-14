export default function EngineHomePage() {
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
      <div style={{ textAlign: "center", maxWidth: "560px" }}>
        <p style={{ margin: 0, opacity: 0.7, fontSize: "0.9rem" }}>Com_Moon Engine</p>
        <h1 style={{ margin: "12px 0 0", fontSize: "2rem" }}>Automation engine is running.</h1>
        <p style={{ margin: "12px 0 0", opacity: 0.82, lineHeight: 1.6 }}>
          This surface is reserved for engine APIs and diagnostics. Use the Hub for operator-facing
          workflows.
        </p>
      </div>
    </main>
  );
}
