import { SOCIAL_BRAND_REGISTRY, socialBrandSupportsProvider } from '../../../lib/social-brand-registry.js';
const TARGETS = Object.fromEntries(Object.values(SOCIAL_BRAND_REGISTRY).map(({ brandKey, brandHandle, label }) =>
  [brandKey, { brandKey, brandHandle, label }],
));

const PROVIDER_PATHS = Object.freeze({
  instagram_api: "/api/social/instagram",
  meta_threads: "/api/social/meta/threads",
});

export const SOCIAL_BRAND_OPTIONS = [
  { value: "", label: "브랜드 선택" },
  ...Object.values(TARGETS).map((target) => ({
    value: target.brandKey,
    label: `${target.label} · @${target.brandHandle}`,
  })),
];

export function socialBrandTarget(brandKey) {
  return Object.hasOwn(TARGETS, brandKey) ? TARGETS[brandKey] : null;
}

export function socialBrandUrl(action, provider, brandKey) {
  const target = socialBrandTarget(brandKey);
  const path = PROVIDER_PATHS[provider];
  if (!target || !path || !socialBrandSupportsProvider(brandKey, provider) || !["status", "connect"].includes(action)) return null;
  const params = new URLSearchParams({
    brand: target.brandHandle,
    brandKey: target.brandKey,
  });
  if (action === "connect") params.set("returnPath", `/dashboard/settings?socialBrand=${target.brandKey}`);
  return `${path}/${action}?${params.toString()}`;
}
