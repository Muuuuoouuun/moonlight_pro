"use client";
// 프로젝트 탭 > 제품 보기 (docs/superpowers/specs/2026-09-24-product-dev-projects-draft.md §6).
// 제품 = 오래 사는 것. 한 줄에 이름 · 단계 · 막힘 1개 · 다음 행동만 두고, 나머지는 제품 상세 드로어로 보낸다
// (표면 예산, CLAUDE.md 2026-09-23). 동시 진행 상한은 운영자 미정이라 막거나 경고하지 않는다(§12-5).
import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button, EditDrawer, EmptyState, Kbd, Skeleton, TruthBadge } from "../hub-primitives";
import { Iconed } from "../hub-icons";
import { useToast } from "../hub-toast";
import { usePageCreateHotkey } from "../use-crm-keyboard";
import {
  PRICING_MODELS,
  PRODUCT_ORG_SCOPES,
  PRODUCT_SUBJECT_OPTIONS,
  formToProductInput,
  productBlocker,
  productNextAction,
  productStageLabel,
  productStageOrder,
  productToForm,
} from "../../../lib/product-catalog.js";
import { createProduct, readGitHubStatus, readProducts, runGitHubSync, updateProduct } from "./product-client.js";
import { ProductDetailDrawer } from "./product-detail-drawer";
import styles from "./project-products.module.css";

const ORG_SCOPE_LABEL = Object.fromEntries(PRODUCT_ORG_SCOPES.map((scope) => [scope.value, scope.label]));
const EMPTY_LEDGER = { status: "loading", products: [], candidates: [], missing: [] };

function newId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function seoulToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

export function productFormFields({ creating }) {
  return [
    { key: "name", label: "이름", maxLength: 120, placeholder: "예: OMR 메이커" },
    { key: "summary", label: "한 줄 설명", maxLength: 200, placeholder: "무엇인가 — 예: 학원 시험지 OMR 자동 채점" },
    ...(creating ? [{ key: "orgScope", label: "소속", type: "select", options: PRODUCT_ORG_SCOPES }] : []),
    { key: "problem", label: "해결하는 문제", type: "textarea", rows: 3, optional: true, placeholder: "누가 무엇 때문에 괴로운가 — 예: 수기 채점에 주 5시간" },
    { key: "orgTypes", label: "대상 기관 유형", optional: true, placeholder: "학원, 교습소 (쉼표로 구분)", row: "target", flex: 1.4 },
    { key: "size", label: "규모", optional: true, placeholder: "1~3관", row: "target" },
    { key: "subjects", label: "대상 과목", type: "chips", options: PRODUCT_SUBJECT_OPTIONS, optional: true },
    { key: "regions", label: "지역", optional: true, placeholder: "전국 또는 서울, 경기" },
    { key: "capabilities", label: "제공 범위 · 확인된 기능만 한 줄에 하나", type: "textarea", rows: 4, optional: true, placeholder: "PDF 채점\n성적표 출력" },
    { key: "requirements", label: "필수 조건 · 없으면 못 사는 것 한 줄에 하나", type: "textarea", rows: 3, optional: true, placeholder: "스캐너 보유\n월 결제 가능" },
    { key: "pricingModel", label: "가격 모델", type: "select", options: PRICING_MODELS, optional: true, row: "price" },
    { key: "pricingAmount", label: "금액(원)", optional: true, placeholder: "29000", row: "price", inputType: "text" },
    { key: "deployUrl", label: "배포 URL", optional: true, placeholder: "https://", inputType: "url" },
    { key: "links", label: "링크 · 이름 | https://주소", type: "textarea", rows: 2, optional: true, placeholder: "문서 | https://…" },
    { key: "nextAction", label: "다음 행동", optional: true, maxLength: 300, placeholder: "비우면 단계 조건에서 자동으로 제안해요" },
  ];
}

function ProductRow({ product, onOpen }) {
  const blocker = productBlocker(product);
  const next = productNextAction(product, { repositories: product.repositories.length, projects: product.projects.length });
  const scope = ORG_SCOPE_LABEL[product.orgScope] || product.orgScope;
  const label = `${product.name}, ${productStageLabel(product.stage)} 단계, ${scope}${blocker ? `, 막힘: ${blocker.label}` : ""}`;
  return (
    <button type="button" className={`hub-row ${styles.row}${blocker?.kind === "ci" ? ` ${styles.rowBlocked}` : ""}`} onClick={() => onOpen(product.id)} aria-label={label}>
      <span className={styles.nameCell}>
        <span className={styles.name}>
          <span className={styles.nameText}>{product.name}</span>
          <span className={styles.scope}>{scope}</span>
        </span>
        <span className={styles.summary}>{product.summary}</span>
      </span>
      <span className={styles.stage}><span className={styles.cellLabel}>단계</span>{productStageLabel(product.stage)}</span>
      {blocker ? (
        <span className={styles.blocker}><Iconed name="x" size={12} /><span>{blocker.label}</span></span>
      ) : (
        <span className={styles.none}><span className={styles.cellLabel}>막힘</span>없음</span>
      )}
      <span className={styles.next}><span className={styles.cellLabel}>다음</span>{next?.text || "—"}</span>
    </button>
  );
}

export function ProjectProductsView({ onOpenProject }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [ledger, setLedger] = React.useState(EMPTY_LEDGER);
  const [github, setGithub] = React.useState({ state: "loading" });
  const [selectedId, setSelectedId] = React.useState(null);
  const [editing, setEditing] = React.useState(null); // { creating, product, record }
  const [syncing, setSyncing] = React.useState(false);
  const deepLinkHandledRef = React.useRef(false);

  const load = React.useCallback(async (signal) => {
    const [products, status] = await Promise.all([readProducts(signal), readGitHubStatus(signal)]);
    if (signal?.aborted) return;
    setLedger({ ...EMPTY_LEDGER, ...products });
    setGithub(status);
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch(() => {});
    return () => controller.abort();
  }, [load]);

  // ?product=<id> — 기록 로드 후 1회 열고 쿼리를 지운다(DESIGN §8.1 딥링크).
  React.useEffect(() => {
    if (deepLinkHandledRef.current || ledger.status === "loading") return;
    const requested = searchParams.get("product");
    if (!requested) return;
    deepLinkHandledRef.current = true;
    if (ledger.products.some((product) => product.id === requested)) setSelectedId(requested);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("product");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [ledger, pathname, router, searchParams]);

  const products = React.useMemo(
    () => [...ledger.products].sort((a, b) => productStageOrder(a.stage) - productStageOrder(b.stage)
      || String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))),
    [ledger.products],
  );
  const selected = products.find((product) => product.id === selectedId) || null;

  const openCreate = React.useCallback(() => {
    setSelectedId(null);
    // EditDrawer는 값이 있는 선택 칸이 하나라도 있으면 묶음을 펼친다 — 빈 배열·기본 가격 모델도
    // "값"으로 읽히므로 새 제품은 비워 두고(formToProductInput이 기본값으로 채운다) 접힌 채 시작한다.
    setEditing({ creating: true, product: null, record: { ...productToForm(null), id: null, subjects: null, pricingModel: "" } });
  }, []);
  const canCreate = ledger.status !== "loading" && ledger.status !== "preview" && ledger.error !== "products-table-missing";
  usePageCreateHotkey(openCreate, { enabled: canCreate && !selected && !editing });

  const openEdit = React.useCallback((product) => {
    setEditing({ creating: false, product, record: productToForm(product) });
  }, []);

  const saveEditing = React.useCallback(async () => {
    if (!editing) return { ok: false, status: "error" };
    const input = formToProductInput(editing.record, editing.product, { newId, today: seoulToday() });
    if (!input.name) return { ok: false, status: "error", message: "이름을 적어 주세요." };
    if (!input.summary) return { ok: false, status: "error", message: "한 줄 설명을 적어 주세요." };
    const outcome = editing.creating
      ? await createProduct({ id: newId(), orgScope: editing.record.orgScope, ...input })
      : await updateProduct({ id: editing.product.id, expectedUpdatedAt: editing.product.updatedAt, ...input });
    if (outcome.ok) {
      toast.success(editing.creating ? `제품 ‘${input.name}’을 등록했어요.` : `‘${input.name}’ 카드를 저장했어요.`);
      await load();
      if (outcome.entity?.id) setSelectedId(outcome.entity.id);
    }
    return outcome;
  }, [editing, load, toast]);

  const syncGitHub = React.useCallback(async () => {
    setSyncing(true);
    const result = await runGitHubSync();
    setSyncing(false);
    if (result.tone === "danger") toast.error(result.message);
    else toast(result.message);
    await load();
  }, [load, toast]);

  const githubNote = github.state === "live"
    ? github.linkedRepositories
      ? `GitHub 저장소 ${github.linkedRepositories}개 연결`
      : github.source === "env"
        ? `환경 변수 저장소 ${github.repositories?.length || 0}개 · 제품에 연결 전`
        : "연결된 저장소 없음"
    : github.state === "preview" ? "Engine 연결 없음" : github.state === "loading" ? null : "GitHub 상태를 읽지 못했어요";

  let body;
  if (ledger.status === "loading") {
    body = <Skeleton lines={4} height={44} gap={10} label="제품 목록 불러오는 중" />;
  } else if (ledger.status === "error") {
    body = ledger.error === "products-table-missing" ? (
      <EmptyState
        icon="lock"
        title="제품 저장소가 아직 없어요"
        description="운영 DB에 0049_products 마이그레이션을 적용한 뒤 다시 불러오세요. (npm run db:migrate 20260925_0049_products.sql)"
        action={<Button variant="outline" size="sm" icon="refresh" onClick={() => load()}>다시 불러오기</Button>}
      />
    ) : (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <TruthBadge state="error" reason="제품 목록을 읽지 못했어요." />
        <Button variant="ghost" size="sm" icon="refresh" onClick={() => load()}>다시 시도</Button>
      </div>
    );
  } else if (ledger.status === "preview") {
    body = (
      <EmptyState
        icon="lock"
        title="Preview · 연결 필요"
        description="Supabase가 연결되지 않아 제품 카탈로그를 읽고 쓸 수 없어요."
      />
    );
  } else if (!products.length) {
    body = (
      <EmptyState
        icon="projects"
        title="아직 등록한 제품이 없어요"
        description="파는 것을 제품으로 등록하면 저장소·프로젝트·신호가 한곳에 모여요. 이름과 한 줄 설명만 있으면 시작할 수 있어요."
        action={<Button variant="primary" size="sm" icon="plus" onClick={openCreate}>첫 제품 등록 <Kbd>N</Kbd></Button>}
      />
    );
  } else {
    body = (
      <div className={styles.list} role="list" aria-label="제품">
        <div className={styles.head} aria-hidden="true">
          <span>제품</span><span>단계</span><span>막힘</span><span>다음 행동</span>
        </div>
        {products.map((product) => (
          <div role="listitem" key={product.id}>
            <ProductRow product={product} onOpen={setSelectedId} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.view}>
      <div className={styles.toolbar}>
        <span className={styles.toolbarText}>
          {ledger.status !== "loading" && ledger.status !== "error" && ledger.status !== "preview" && (
            <span>제품 <span className="num">{products.length}</span>개</span>
          )}
          {ledger.status === "partial" && <TruthBadge state="partial" reason={`일부 데이터: ${ledger.missing.join(", ") || "상한 도달"}`} />}
          {githubNote && <span>{githubNote}</span>}
        </span>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" icon="refresh" onClick={syncGitHub} disabled={syncing || github.state === "loading"}>
          {syncing ? "동기화 중…" : "GitHub 동기화"}
        </Button>
        <Button variant="primary" size="sm" icon="plus" onClick={openCreate} disabled={!canCreate}>
          제품 <Kbd>N</Kbd>
        </Button>
      </div>
      {body}

      {selected && !editing && (
        <ProductDetailDrawer
          product={selected}
          candidates={ledger.candidates}
          github={github}
          onClose={() => setSelectedId(null)}
          onEdit={() => openEdit(selected)}
          onChanged={() => load()}
          onOpenProject={onOpenProject}
          onSyncGitHub={syncGitHub}
          syncing={syncing}
        />
      )}

      {editing && (
        <EditDrawer
          title={editing.creating ? "새 제품" : `${editing.product.name} 카드 편집`}
          subtitle={editing.creating
            ? "이름과 한 줄 설명만 있으면 등록돼요. 나머지는 단계가 올라갈 때 채워요."
            : `${ORG_SCOPE_LABEL[editing.product.orgScope] || ""} · 제공 범위·필수 조건을 바꾸면 버전이 올라가요 (지금 v${editing.product.version})`}
          record={editing.record}
          fields={productFormFields({ creating: editing.creating })}
          optionalLabel="제품 카드 나머지 칸"
          width="min(460px, 96vw)"
          saveLabel={editing.creating ? "제품 등록" : "카드 저장"}
          onChange={(key, value) => setEditing((current) => current && { ...current, record: { ...current.record, [key]: value } })}
          onSave={saveEditing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
