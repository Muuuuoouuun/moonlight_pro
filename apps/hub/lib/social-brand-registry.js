// Explicit operator-confirmed brand/handle/app boundaries, shared by UI and BFF.
// Credentials remain server-only and never fall through from a dedicated app.
export const SOCIAL_BRAND_REGISTRY = Object.freeze({
  bridgemaker: { brandKey: 'bridgemaker', appKey: 'moonlight', brandHandle: 'ml_bridgemaker', label: 'BridgeMaker', providers: ['instagram_api', 'meta_threads'] },
  politicofficer: { brandKey: 'politicofficer', appKey: 'politic_officer', envSuffix: 'POLITIC_OFFICER', brandHandle: 'politic_officer', label: 'Politic Officer', providers: ['instagram_api', 'meta_threads'] },
  classmoon: { brandKey: 'classmoon', appKey: 'classmoon', envSuffix: 'CLASSMOON', brandHandle: 'moon.classin', label: 'Class.Moon', providers: ['instagram_api', 'meta_threads'] },
  gore: { brandKey: 'gore', appKey: 'gore', envSuffix: 'GORE', brandHandle: 'go_re_startagain', label: 'Go;Re', providers: ['meta_threads'] },
});

export function socialBrandSupportsProvider(brandKey, provider) {
  return Object.hasOwn(SOCIAL_BRAND_REGISTRY, brandKey) && SOCIAL_BRAND_REGISTRY[brandKey].providers.includes(provider);
}
