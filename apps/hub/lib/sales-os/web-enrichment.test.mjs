import assert from "node:assert/strict";
import test from "node:test";

import { linkLabel, naverMapHref, safeUrlList, telHref, webEnrichmentView } from "./web-enrichment.js";

const enrichment = (fields) => ({ meta: { enrichment_web: { researched_at: "2026-10-20", ...fields } } });

test("no enrichment_web (or only bookkeeping keys) hides the section", () => {
  assert.equal(webEnrichmentView(null), null);
  assert.equal(webEnrichmentView({ meta: {} }), null);
  assert.equal(webEnrichmentView({ meta: { enrichment_web: [] } }), null);
  assert.equal(webEnrichmentView(enrichment({ confidence: "low", match_status: "partial", version: "web-enrich-v1" })), null);
});

test("a found row maps to display rows with map, tel and source links", () => {
  const view = webEnrichmentView({
    website: "https://www.example-academy.kr/",
    ...enrichment({
      address: "경기도 안양시 동안구 평촌대로 112 6층",
      region_sido: "경기도",
      region_sigungu: "안양시 동안구",
      dong: "평촌동",
      building_or_area: "평촌 학원가",
      phone: "031-000-0000",
      subjects: "국어·영어",
      target_grades: "중·고등",
      brand_type: "local",
      av_signal: "전자칠판 2대",
      source_urls: ["https://m.place.naver.com/place/1/home", "https://m.place.naver.com/place/1/home"],
      blog_or_sns: ["https://blog.naver.com/example"],
      confidence: "high",
      match_status: "found",
      note: "메모",
    }),
  });
  assert.equal(view.mapHref, `https://map.naver.com/p/search/${encodeURIComponent("경기도 안양시 동안구 평촌대로 112 6층")}`);
  assert.equal(view.region, "경기도 안양시 동안구 평촌동");
  assert.equal(view.area, "평촌 학원가");
  assert.equal(view.phoneHref, "tel:0310000000");
  assert.deepEqual(view.links, ["https://www.example-academy.kr/", "https://blog.naver.com/example"]);
  assert.deepEqual(view.sources, ["https://m.place.naver.com/place/1/home"]);
  assert.equal(view.subjectsLine, "국어·영어 · 중·고등");
  assert.equal(view.brandType, "로컬");
  assert.equal(view.confidenceLabel, "신뢰도 높음");
  assert.equal(view.confidenceCertainty, "confirmed");
  assert.equal(view.matchStatusLabel, "확인");
  assert.equal(view.researchedAt, "2026-10-20");
  assert.equal(view.note, "메모");
});

test("links from outside data are limited to http(s)", () => {
  assert.deepEqual(safeUrlList(["javascript:alert(1)", "ftp://x", "not a url", "http://a.kr"]), ["http://a.kr/"]);
  const view = webEnrichmentView({ website: "javascript:alert(1)", ...enrichment({ subjects: "영어", blog_or_sns: "data:text/html,x" }) });
  assert.deepEqual(view.links, []);
});

test("small helpers", () => {
  assert.equal(telHref("0507-1234-5678"), "tel:050712345678");
  assert.equal(telHref("문의"), null);
  assert.equal(naverMapHref(""), null);
  assert.equal(linkLabel("https://www.pc5aacademy.com/"), "pc5aacademy.com");
  assert.equal(linkLabel("https://blog.naver.com/abc/"), "blog.naver.com/abc");
});

test("legacy key names (status, notes) and unknown confidence still read", () => {
  const view = webEnrichmentView(enrichment({ subjects: "수학", status: "partial", notes: "n", confidence: "??" }));
  assert.equal(view.matchStatusLabel, "일부 확인");
  assert.equal(view.note, "n");
  assert.equal(view.confidenceLabel, "");
});
