// Shared, key-free query catalog. Keep this module small enough for the client selector.
export const NEWS_SEARCH_TOPICS = Object.freeze({
  politicofficer: Object.freeze([
    { id: 'korea', label: '대한민국 정치·사회', q: '대한민국 정치 국회 정부 정책 사회 이슈', country: 'KR', searchLang: 'ko' },
    { id: 'world', label: '국제 정치·외교', q: 'international politics diplomacy government policy', country: 'ALL', searchLang: 'en' },
  ]),
  classmoon: Object.freeze([
    { id: 'education-office', label: '교육부·교육청 발표', q: '교육부 교육청 교육 정책 발표', country: 'KR', searchLang: 'ko' },
    { id: 'education-tech', label: '교육 테크·수업', q: '교육 AI 에듀테크 수업 활용', country: 'KR', searchLang: 'ko' },
    { id: 'ebs', label: 'EBS·교육 이슈', q: 'EBS 교육 뉴스 학습 교육 이슈', country: 'KR', searchLang: 'ko' },
  ]),
  '22nomad': Object.freeze([
    { id: 'ai-labs', label: 'OpenAI·Anthropic 비교', q: 'OpenAI Anthropic ChatGPT Claude AI update', country: 'US', searchLang: 'en' },
    { id: 'openai', label: 'OpenAI·ChatGPT', q: 'OpenAI ChatGPT AI update release', country: 'US', searchLang: 'en' },
    { id: 'anthropic', label: 'Anthropic·Claude', q: 'Anthropic Claude AI update release', country: 'US', searchLang: 'en' },
    { id: 'google', label: 'Google·Gemini', q: 'Google Gemini AI update release', country: 'US', searchLang: 'en' },
    { id: 'nvidia', label: 'NVIDIA', q: 'NVIDIA AI GPU developer announcement', country: 'US', searchLang: 'en' },
    { id: 'grok-tesla', label: 'Grok·Tesla·Musk', q: 'Grok xAI Tesla Elon Musk technology announcement', country: 'US', searchLang: 'en' },
    { id: 'silicon-valley', label: '실리콘밸리·개발자 행사', q: 'Silicon Valley AI startup developer conference', country: 'US', searchLang: 'en' },
  ]),
});

export function newsSearchPlan(brand, topic, freshness = 'pd') {
  if (freshness !== 'pd' && freshness !== 'pw') return null;
  const match = NEWS_SEARCH_TOPICS[brand]?.find((entry) => entry.id === topic);
  return match ? { ...match, brand, freshness } : null;
}
