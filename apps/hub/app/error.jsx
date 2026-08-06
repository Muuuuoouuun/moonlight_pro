"use client";

// 전역 에러 바운더리 — 31개 lazy 페이지 중 한 곳의 렌더 throw가 셸 전체를 Next 기본
// 에러 화면으로 갈아치우던 공백(5차 재감사 안정성 S). 원인 명명 + 리셋 경로 제공.
//
// 색상 하드코딩은 문서화된 경계 예외: 허브 토큰은 .hub-app 스코프라 바운더리(셸 밖)에선
// 참조 불가 — DESIGN.md §5 스크림·명함 팔레트와 같은 계열의 예외이며 값은 다크 토큰과 일치.
export default function DashboardError({ error, reset }) {
  return (
    <div
      role="alert"
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: 24,
        fontFamily: "'SUIT Variable', ui-sans-serif, system-ui, sans-serif",
        color: "#c8cdd6",
        background: "#0c1018",
        textAlign: "center",
      }}
    >
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>화면을 그리지 못했습니다</h2>
      <div style={{ fontSize: 12.5, lineHeight: 1.6, maxWidth: 420, color: "#8a919e" }}>
        이 화면에서 오류가 발생했습니다. 데이터는 손상되지 않았습니다 — 다시 시도하거나
        첫 화면으로 이동하세요.
        {error?.message ? (
          <span style={{ display: "block", marginTop: 6, fontFamily: "ui-monospace, monospace", fontSize: 11, color: "#6a707c", overflowWrap: "anywhere" }}>
            {String(error.message).slice(0, 200)}
          </span>
        ) : null}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            padding: "8px 16px",
            fontSize: 12.5,
            fontWeight: 500,
            color: "#0c1018",
            background: "#d3d7de",
            border: "1px solid #e6e8ec",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          다시 시도
        </button>
        <a
          href="/dashboard/daily-brief"
          style={{
            padding: "8px 16px",
            fontSize: 12.5,
            fontWeight: 500,
            color: "#c8cdd6",
            border: "1px solid #3a3f49",
            borderRadius: 6,
            textDecoration: "none",
          }}
        >
          첫 화면으로
        </a>
      </div>
    </div>
  );
}
