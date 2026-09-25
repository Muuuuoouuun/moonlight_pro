"use client";
// 프로젝트 탭 > 제품 — 제품 운영실 B안 (docs/superpowers/specs/2026-09-25-product-operations-room-design.md §0).
// URL이 화면을 고른다: 기본은 포트폴리오, `?product=<id>`는 그 제품의 흐름 페이지, `?pview=inbox`는 문의함
// (`&inquiry=<id>`로 한 건 선택). 카드 편집(EditDrawer)과 설정(저장소·GitHub·단계, ProductDetailDrawer)은
// 여기서 여는 드로어다. 동시 진행 상한은 운영자 미정이라 막거나 경고하지 않는다(§12-5).
import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button, EditDrawer, EmptyState, Kbd, SegmentedControl, Skeleton, TruthBadge } from "../hub-primitives";
import { useToast } from "../hub-toast";
import { usePageCreateHotkey } from "../use-crm-keyboard";
import {
  PRICING_MODELS,
  PRODUCT_ORG_SCOPES,
  formToProductInput,
  productToForm,
  seoulMonth,
} from "../../../lib/product-catalog.js";
import { createProduct, readGitHubStatus, readProducts, runGitHubSync, updateProduct } from "./product-client.js";
import { ProductDetailDrawer } from "./product-detail-drawer";
import { ProductInbox } from "./product-inbox";
import { ProductPage } from "./product-page";
import { ProductPortfolio } from "./product-portfolio";
import styles from "./product-room.module.css";

const ORG_SCOPE_LABEL = Object.fromEntries(PRODUCT_ORG_SCOPES.map((scope) => [scope.value, scope.label]));
const EMPTY_LEDGER = { status: "loading", products: [], candidates: [], inquiries: [], inquiryCandidates: [], areas: [], missing: [] };

function newId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function productFormFields({ creating }) {
  return [
    { key: "name", label: "이름", maxLength: 120, placeholder: "예: OMR 메이커" },
    { key: "summary", label: "한 줄 설명", maxLength: 200, placeholder: "무엇인가 — 예: 학원 시험지 OMR 자동 채점" },
    ...(creating ? [{ key: "orgScope", label: "소속", type: "select", options: PRODUCT_ORG_SCOPES }] : []),
    // 분야에 묶인 칸(과목·지역·규모)은 두지 않는다 — 분야는 한 단어, 세부는 특이사항에(2026-09-25 운영자).
    { key: "domain", label: "분야", optional: true, maxLength: 40, placeholder: "예: 교육", row: "who" },
    { key: "audience", label: "대상 고객", optional: true, maxLength: 200, placeholder: "누가 사나 — 예: 학원 원장", row: "who", flex: 1.6 },
    { key: "problem", label: "해결하는 문제", type: "textarea", rows: 3, optional: true, placeholder: "누가 무엇 때문에 괴로운가" },
    { key: "capabilities", label: "기능 · 한 줄에 하나 (점검은 상세 체크리스트에서)", type: "textarea", rows: 4, optional: true, placeholder: "PDF 채점\n성적표 출력" },
    { key: "requirements", label: "필수 조건 · 없으면 못 사는 것 한 줄에 하나", type: "textarea", rows: 3, optional: true, placeholder: "스캐너 보유\n월 결제 가능" },
    { key: "pricingModel", label: "가격 모델", type: "select", options: PRICING_MODELS, optional: true, row: "price" },
    { key: "pricingAmount", label: "금액(원)", optional: true, placeholder: "29000", row: "price", inputType: "text" },
    { key: "deployUrl", label: "배포 URL", optional: true, placeholder: "https://", inputType: "url" },
    { key: "links", label: "링크 · 이름 | https://주소", type: "textarea", rows: 2, optional: true, placeholder: "문서 | https://…" },
    { key: "notes", label: "특이사항", type: "textarea", rows: 4, optional: true, maxLength: 2000, placeholder: "과목·지역·규모·조건 같은 세부 사항을 자유롭게" },
    { key: "nextAction", label: "다음 행동", optional: true, maxLength: 300, placeholder: "비우면 단계 조건에서 자동으로 제안해요" },
  ];
}

export function ProjectProductsView({ onOpenProject }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [ledger, setLedger] = React.useState(EMPTY_LEDGER);
  const [github, setGithub] = React.useState({ state: "loading" });
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(null); // { creating, product, record }
  const [syncing, setSyncing] = React.useState(false);

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

  // 화면 고르기 — URL이 정본(뒤로 가기·새로고침·공유가 그대로 된다).
  const productId = searchParams.get("product") || null;
  const inboxOpen = searchParams.get("pview") === "inbox";
  const inquiryId = searchParams.get("inquiry") || null;
  const navigate = React.useCallback((patch) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined || value === "") params.delete(key);
      else params.set(key, value);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);
  const openProduct = React.useCallback((id) => navigate({ product: id, pview: null, inquiry: null }), [navigate]);
  const openInbox = React.useCallback((id = null) => navigate({ pview: "inbox", product: null, inquiry: id }), [navigate]);
  const openPortfolio = React.useCallback(() => navigate({ pview: null, product: null, inquiry: null }), [navigate]);

  const products = ledger.products;
  const current = productId ? products.find((product) => product.id === productId) || null : null;
  const selected = settingsOpen && current ? current : null;
  const month = ledger.month || seoulMonth();

  const openCreate = React.useCallback(() => {
    setSettingsOpen(false);
    // EditDrawer는 값이 있는 선택 칸이 하나라도 있으면 묶음을 펼친다 — 기본 가격 모델도
    // "값"으로 읽히므로 새 제품은 비워 두고(formToProductInput이 기본값으로 채운다) 접힌 채 시작한다.
    setEditing({ creating: true, product: null, record: { ...productToForm(null), id: null, pricingModel: "" } });
  }, []);
  const canCreate = ledger.status !== "loading" && ledger.status !== "preview" && ledger.error !== "products-table-missing";
  // 포트폴리오의 N = 제품 등록. 제품 페이지는 자기 N(＋ 일)을 가진다.
  usePageCreateHotkey(openCreate, { enabled: canCreate && !productId && !inboxOpen && !editing });

  const openEdit = React.useCallback((product) => {
    setEditing({ creating: false, product, record: productToForm(product) });
  }, []);

  const saveEditing = React.useCallback(async () => {
    if (!editing) return { ok: false, status: "error" };
    const input = formToProductInput(editing.record, editing.product, { newId });
    if (!input.name) return { ok: false, status: "error", message: "이름을 적어 주세요." };
    if (!input.summary) return { ok: false, status: "error", message: "한 줄 설명을 적어 주세요." };
    const outcome = editing.creating
      ? await createProduct({ id: newId(), orgScope: editing.record.orgScope, ...input })
      : await updateProduct({ id: editing.product.id, expectedUpdatedAt: editing.product.updatedAt, ...input });
    if (outcome.ok) {
      toast.success(editing.creating ? `제품 ‘${input.name}’을 등록했어요.` : `‘${input.name}’ 카드를 저장했어요.`);
      await load();
      if (editing.creating && outcome.entity?.id) openProduct(outcome.entity.id);
    }
    return outcome;
  }, [editing, load, openProduct, toast]);

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

  const status = ledger.status;
  let body;
  if (status === "loading") {
    body = <Skeleton lines={5} height={44} gap={10} label="제품 불러오는 중" />;
  } else if (status === "error") {
    body = ledger.error === "products-table-missing" ? (
      <EmptyState
        icon="lock"
        title="제품 저장소가 아직 없어요"
        description="운영 DB에 0049_products 마이그레이션을 적용한 뒤 다시 불러오세요. (npm run db:migrate 20260925_0049_products.sql)"
        action={<Button variant="outline" size="sm" icon="refresh" onClick={() => load()}>다시 불러오기</Button>}
      />
    ) : (
      <div className={styles.bar}>
        <TruthBadge state="error" reason="제품을 읽지 못했어요." />
        <Button variant="ghost" size="sm" icon="refresh" onClick={() => load()}>다시 시도</Button>
      </div>
    );
  } else if (status === "preview") {
    body = <EmptyState icon="lock" title="Preview · 연결 필요" description="Supabase가 연결되지 않아 제품을 읽고 쓸 수 없어요." />;
  } else if (productId) {
    body = current ? (
      <ProductPage
        product={current}
        month={month}
        areas={ledger.areas || []}
        onBack={openPortfolio}
        onOpenProject={onOpenProject}
        onOpenInquiry={(id) => openInbox(id)}
        onOpenBoard={() => router.push(`${pathname}?view=board&taskProduct=${encodeURIComponent(current.id)}`)}
        onOpenSettings={() => setSettingsOpen(true)}
        onEditCard={() => openEdit(current)}
        onChanged={() => load()}
      />
    ) : (
      <EmptyState icon="projects" title="제품을 찾지 못했어요" description="지워졌거나 다른 워크스페이스의 제품이에요."
        action={<Button variant="outline" size="sm" onClick={openPortfolio}>포트폴리오로</Button>} />
    );
  } else if (inboxOpen) {
    body = (
      <ProductInbox
        inquiries={ledger.inquiries || []}
        products={products}
        areas={ledger.areas || []}
        selectedId={inquiryId}
        onSelect={(id) => navigate({ inquiry: id })}
        onChanged={() => load()}
      />
    );
  } else if (!products.length) {
    body = (
      <EmptyState
        icon="projects"
        title="아직 등록한 제품이 없어요"
        description="파는 것을 제품으로 등록하면 일(신기능·보수·연락)과 문의가 제품별로 모여요. 이름과 한 줄 설명만 있으면 시작할 수 있어요."
        action={<Button variant="primary" size="sm" icon="plus" onClick={openCreate}>첫 제품 등록 <Kbd>N</Kbd></Button>}
      />
    );
  } else {
    body = <ProductPortfolio products={products} inquiries={ledger.inquiries || []} month={month} onOpenProduct={openProduct} onOpenInbox={() => openInbox()} />;
  }

  const newInquiries = (ledger.inquiries || []).filter((inquiry) => inquiry.status === "new").length;
  return (
    <div className={styles.room}>
      {!productId && (
        <div className={styles.bar}>
          <SegmentedControl label="제품 화면" value={inboxOpen ? "inbox" : "portfolio"} onChange={(key) => (key === "inbox" ? openInbox() : openPortfolio())}
            options={[{ key: "portfolio", label: "포트폴리오" }, { key: "inbox", label: newInquiries ? `문의함 · 새 ${newInquiries}` : "문의함" }]} />
          {status === "partial" && <TruthBadge state="partial" reason={`일부 데이터: ${ledger.missing.join(", ") || "상한 도달"}`} />}
          {githubNote && !inboxOpen && <span className={styles.dim}>{githubNote}</span>}
          <span className={styles.spacer} />
          {!inboxOpen && (
            <>
              <Button variant="ghost" size="sm" icon="refresh" onClick={syncGitHub} disabled={syncing || github.state === "loading"}>
                {syncing ? "동기화 중…" : "GitHub 동기화"}
              </Button>
              <Button variant="primary" size="sm" icon="plus" onClick={openCreate} disabled={!canCreate}>제품 <Kbd>N</Kbd></Button>
            </>
          )}
        </div>
      )}
      {body}

      {selected && !editing && (
        <ProductDetailDrawer
          product={selected}
          candidates={ledger.candidates}
          inquiryCandidates={ledger.inquiryCandidates || []}
          github={github}
          onClose={() => setSettingsOpen(false)}
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
            ? "이름과 한 줄 설명만 있으면 등록돼요. 나머지는 나중에 채워요."
            : `${ORG_SCOPE_LABEL[editing.product.orgScope] || ""} · 기능·필수 조건을 바꾸면 버전이 올라가요 (지금 v${editing.product.version})`}
          record={editing.record}
          fields={productFormFields({ creating: editing.creating })}
          optionalLabel="제품 카드 나머지 칸"
          width="min(460px, 96vw)"
          saveLabel={editing.creating ? "제품 등록" : "카드 저장"}
          onChange={(key, value) => setEditing((draft) => draft && { ...draft, record: { ...draft.record, [key]: value } })}
          onSave={saveEditing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
