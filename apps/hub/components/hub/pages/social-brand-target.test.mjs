import assert from "node:assert/strict";
import { test } from "node:test";

import { SOCIAL_BRAND_OPTIONS, socialBrandTarget, socialBrandUrl } from "./social-brand-target.js";

test("social brand selection requires an explicit supported brand", () => {
  assert.equal(SOCIAL_BRAND_OPTIONS[0].value, "");
  assert.equal(socialBrandTarget(""), null);
  assert.equal(socialBrandTarget("unknown"), null);
  assert.deepEqual(socialBrandTarget("classmoon"), {
    brandKey: "classmoon", brandHandle: "moon.classin", label: "Class.Moon",
  });
});

test("social status and connect URLs bind the same brand key and handle", () => {
  const status = new URL(socialBrandUrl("status", "meta_threads", "politicofficer"), "https://hub.example.com");
  const connect = new URL(socialBrandUrl("connect", "instagram_api", "politicofficer"), "https://hub.example.com");
  for (const url of [status, connect]) {
    assert.equal(url.searchParams.get("brand"), "politic_officer");
    assert.equal(url.searchParams.get("brandKey"), "politicofficer");
  }
  assert.equal(connect.searchParams.get("returnPath"), "/dashboard/settings?socialBrand=politicofficer");
  assert.equal(socialBrandUrl("connect", "instagram_api", ""), null);
  assert.equal(socialBrandUrl("connect", "instagram_api", "unknown"), null);
  assert.equal(socialBrandUrl("connect", "unknown", "classmoon"), null);
});

test('approved brand URLs preserve exact handles and provider boundaries', () => {
  for (const [brandKey, handle, providers] of [
    ['gore', 'go_re_startagain', ['instagram_api', 'meta_threads']],
    ['22nomad', '22th.nomad', ['instagram_api', 'meta_threads']],
    ['holyfuncollector', 'holyfuncollect0r', ['instagram_api']],
    ['sinabro', 'dazz.ling_u', ['meta_threads']],
    ['studyseagull', 'study_seagull', ['instagram_api']],
  ]) {
    assert.ok(SOCIAL_BRAND_OPTIONS.some(option => option.value === brandKey && option.label.includes(`@${handle}`)));
    for (const action of ['status', 'connect']) {
      for (const provider of ['instagram_api', 'meta_threads']) {
        const target = socialBrandUrl(action, provider, brandKey);
        if (!providers.includes(provider)) { assert.equal(target, null); continue; }
        const url = new URL(target, 'https://hub.example.com');
        assert.equal(url.searchParams.get('brandKey'), brandKey);
        assert.equal(url.searchParams.get('brand'), handle);
      }
    }
  }
});
