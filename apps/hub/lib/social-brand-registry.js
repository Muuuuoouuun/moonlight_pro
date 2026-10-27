// Explicit operator-confirmed brand/handle/app boundaries, shared by UI and BFF.
// Credentials remain server-only and never fall through from a dedicated app.
export const SOCIAL_BRAND_REGISTRY = Object.freeze({
  bridgemaker: { brandKey: 'bridgemaker', appKey: 'moonlight', brandHandle: 'ml_bridgemaker', label: 'BridgeMaker', providers: ['instagram_api', 'meta_threads'] },
  politicofficer: { brandKey: 'politicofficer', appKey: 'politic_officer', envSuffix: 'POLITIC_OFFICER', brandHandle: 'politic_officer', label: 'Politic Officer', providers: ['instagram_api', 'meta_threads'] },
  classmoon: { brandKey: 'classmoon', appKey: 'classmoon', envSuffix: 'CLASSMOON', brandHandle: 'moon.classin', label: 'Class.Moon', providers: ['instagram_api', 'meta_threads'] },
  gore: { brandKey: 'gore', appKey: 'gore', envSuffix: 'GORE', brandHandle: 'go_re_startagain', label: 'Go;Re', providers: ['instagram_api', 'meta_threads'] },
  '22nomad': { brandKey: '22nomad', appKey: '22nomad', envSuffix: 'NOMAD_22', brandHandle: '22th.nomad', label: '22th.Nomad', providers: ['instagram_api', 'meta_threads'] },
  holyfuncollector: { brandKey: 'holyfuncollector', appKey: 'holyfuncollector', envSuffix: 'HOLYFUN_COLLECTOR', brandHandle: 'holyfuncollect0r', label: 'HolyFunCollector', providers: ['instagram_api'] },
  sinabro: { brandKey: 'sinabro', appKey: 'sinabro', envSuffix: 'SINABRO', brandHandle: 'dazz.ling_u', label: 'Sinabro', providers: ['meta_threads'] },
  studyseagull: { brandKey: 'studyseagull', appKey: 'studyseagull', envSuffix: 'STUDY_SEAGULL', brandHandle: 'study_seagull', label: 'Study.Seagull', providers: ['instagram_api'] },
});

export function socialBrandSupportsProvider(brandKey, provider) {
  return Object.hasOwn(SOCIAL_BRAND_REGISTRY, brandKey) && SOCIAL_BRAND_REGISTRY[brandKey].providers.includes(provider);
}
