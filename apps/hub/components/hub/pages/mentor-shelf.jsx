"use client";

import React from 'react';
import { GURU_CARDS, LEGEND_CARDS, guidanceDailyWindow, listGuidanceCards, listGuidanceCardsForPerson, listGuidancePeople, selectGuidanceCard } from '@com-moon/guru-guidance';
import { Button, Card, EmptyState, SegmentedControl, TextField } from '../hub-primitives';
import { GuidanceDetail } from '../guidance-detail';
import { GuidanceSource } from '../guidance-source';
import './mentor-shelf.css';

const HIDDEN_KEY = 'mlp.mentorShelfHidden';
const DOMAINS = [
  { key: 'sales', label: '세일즈' },
  { key: 'marketing', label: '마케팅' },
  { key: 'content', label: '콘텐츠' },
];
const ATLAS_DOMAINS = [...DOMAINS, { key: 'legend', label: 'Legend' }];
const BROWSE_MODES = [
  { key: 'domain', label: '분야별' },
  { key: 'person', label: '인물별' },
];
const ALL_CARDS = [...GURU_CARDS, ...LEGEND_CARDS];
const personName = card => card.personName || card.person.split(' · ')[0];
const methodLabel = card => card.methodLabel || card.person.split(' · ').slice(1).join(' · ') || '판단 관점';
const matchingCard = (card, query) => !query || `${personName(card)} ${methodLabel(card)}`.toLocaleLowerCase().includes(query);
const openWithKeyboard = (event, open) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  open();
};

export function MentorShelf({ onGuidanceAsk, onNavigate, requestedCardId }) {
  const [domain, setDomain] = React.useState('sales');
  const [browseDomain, setBrowseDomain] = React.useState('sales');
  const [browseMode, setBrowseMode] = React.useState('domain');
  const [selectedDomainCardId, setSelectedDomainCardId] = React.useState(null);
  const [selectedPersonId, setSelectedPersonId] = React.useState(null);
  const [personOffset, setPersonOffset] = React.useState(0);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [detailCard, setDetailCard] = React.useState(() => ALL_CARDS.find(card => card.id === requestedCardId) || null);
  const [guruOffset, setGuruOffset] = React.useState(0);
  const [legendOffset, setLegendOffset] = React.useState(0);
  const [hidden, setHidden] = React.useState(false);
  const [now, setNow] = React.useState(() => new Date());
  const [newWindowReady, setNewWindowReady] = React.useState(false);

  React.useEffect(() => {
    try { setHidden(sessionStorage.getItem(HIDDEN_KEY) === '1'); } catch {}
  }, []);

  React.useEffect(() => {
    setDetailCard(ALL_CARDS.find(card => card.id === requestedCardId) || null);
  }, [requestedCardId]);

  React.useEffect(() => {
    const refreshOnReturn = () => {
      if (document.hidden) return;
      const current = new Date();
      if (guidanceDailyWindow(current).key !== guidanceDailyWindow(now).key) {
        setGuruOffset(0);
        setNewWindowReady(false);
      }
      setNow(current);
    };
    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => {
      window.removeEventListener('focus', refreshOnReturn);
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
  }, [now]);

  React.useEffect(() => {
    if (newWindowReady) return;
    const windowInfo = guidanceDailyWindow(now);
    const delay = Math.max(0, new Date(windowInfo.nextAt).getTime() - Date.now()) + 100;
    const timer = window.setTimeout(() => {
      if (!document.hidden && guidanceDailyWindow(new Date()).key !== windowInfo.key) setNewWindowReady(true);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [now, newWindowReady]);

  const dailyWindow = guidanceDailyWindow(now);
  const guruCard = selectGuidanceCard({ cadence: 'daily', domain, now, offset: guruOffset });
  const legendCard = selectGuidanceCard({ cadence: 'weekly', now, offset: legendOffset });
  const query = searchTerm.trim().toLocaleLowerCase();
  const domainCards = (browseDomain === 'legend'
    ? [...LEGEND_CARDS]
    : [...listGuidanceCards({ cadence: 'daily', domain: browseDomain })])
    .filter(card => matchingCard(card, query))
    .sort((a, b) => methodLabel(a).localeCompare(methodLabel(b), 'ko') || personName(a).localeCompare(personName(b), 'en'));
  const selectedDomainCard = domainCards.find(card => card.id === selectedDomainCardId) || domainCards[0];
  const people = (browseDomain === 'legend'
    ? LEGEND_CARDS.map(card => ({ id: card.id, name: personName(card) }))
    : listGuidancePeople({ domain: browseDomain }))
    .filter(person => !query || person.name.toLocaleLowerCase().includes(query) || (browseDomain === 'legend'
      ? LEGEND_CARDS : listGuidanceCardsForPerson(person.id))
      .some(card => (browseDomain === 'legend' ? card.id === person.id : card.domain === browseDomain) && matchingCard(card, query)));
  const selectedPerson = people.find(person => person.id === selectedPersonId)
    || (browseMode === 'person' ? people[0] : null);
  const personCards = selectedPerson
    ? (browseDomain === 'legend' ? LEGEND_CARDS.filter(card => card.id === selectedPerson.id)
      : listGuidanceCardsForPerson(selectedPerson.id).filter(card => card.domain === browseDomain))
      .filter(card => !query || selectedPerson.name.toLocaleLowerCase().includes(query) || matchingCard(card, query))
    : [];
  const personCard = personCards.length ? personCards[personOffset % personCards.length] : null;
  const browseCard = browseMode === 'person' ? personCard : selectedDomainCard;
  const browseCardPosition = browseMode === 'person' && personCards.length
    ? personOffset % personCards.length + 1
    : domainCards.findIndex(card => card.id === browseCard?.id) + 1;
  const browseCardCount = browseMode === 'person' ? personCards.length : domainCards.length;
  const browseDomainLabel = ATLAS_DOMAINS.find(item => item.key === browseDomain)?.label || '세일즈';
  const nextTime = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(dailyWindow.nextAt));
  const showCurrentWindow = () => {
    setNow(new Date());
    setGuruOffset(0);
    setNewWindowReady(false);
  };
  const showCards = value => {
    if (value) showCurrentWindow();
    setHidden(!value);
    try { sessionStorage.setItem(HIDDEN_KEY, value ? '0' : '1'); } catch {}
  };
  const chooseDomain = next => {
    setDomain(next);
    setGuruOffset(0);
    if (hidden) showCards(true);
  };
  const chooseBrowseDomain = next => {
    setBrowseDomain(next);
    setSelectedDomainCardId(null);
    setSelectedPersonId(null);
    setPersonOffset(0);
  };
  const chooseSearch = event => {
    setSearchTerm(event.target.value);
    setSelectedDomainCardId(null);
    setSelectedPersonId(null);
    setPersonOffset(0);
  };
  const choosePerson = id => {
    setSelectedPersonId(id);
    setPersonOffset(0);
  };
  const returnToList = () => {
    const choiceId = browseMode === 'person'
      ? `mentor-shelf-choice-person-${selectedPerson?.id}`
      : `mentor-shelf-choice-domain-${browseCard?.id}`;
    document.getElementById(choiceId)?.focus();
  };
  const jumpToBrowse = () => {
    const heading = document.getElementById('mentor-shelf-browse');
    heading?.scrollIntoView();
    heading?.focus({ preventScroll: true });
  };

  React.useEffect(() => {
    const activelyChosen = browseMode === 'person' ? selectedPersonId : selectedDomainCardId;
    if (!activelyChosen || !window.matchMedia('(max-width: 900px)').matches) return;
    document.getElementById('mentor-shelf-person-detail')?.focus();
  }, [selectedPersonId, selectedDomainCardId, browseMode, browseDomain]);

  return <div className="mentor-shelf">
    <header className="mentor-shelf__intro">
      <div>
        <span className="mentor-shelf__eyebrow">MENTOR SHELF</span>
        <h2>필요할 때 꺼내 보는 관점</h2>
        <p>Guru는 실무 자료에서 한 가지 질문을 건네고, Legend는 판단을 다시 보게 합니다. 읽고 지나가거나 직접 물어볼 수 있습니다.</p>
      </div>
      <div className="mentor-shelf__intro-actions">
        <Button variant="outline" size="md" onClick={() => onGuidanceAsk?.(null, { free: true })}>대화 시작</Button>
        <Button variant="ghost" size="md" onClick={jumpToBrowse}>멘토 찾아보기 ↓</Button>
      </div>
    </header>

    <section className="mentor-shelf__section" aria-labelledby="mentor-shelf-today">
      <div className="mentor-shelf__section-head">
        <h3 id="mentor-shelf-today">지금의 서가</h3>
        <span className="mono">{dailyWindow.date} · 서울 기준 09·14·19시 교체</span>
      </div>

      {hidden ? <div className="mentor-shelf__collapsed">
        <span>멘토 카드를 이 세션에서 접었습니다.</span>
        <Button variant="ghost" size="sm" onClick={() => showCards(true)}>다시 보기</Button>
      </div> : <>
        <div className="mentor-shelf__grid">
          <Card role="article" aria-label="오늘의 Guru 카드" className="mentor-shelf__guru">
            <div className="mentor-shelf__card-head">
              <strong>GURU / 실무 관점</strong>
              <span className="mono">{dailyWindow.label} · {newWindowReady ? '새 관점 준비됨' : `다음 ${nextTime}`}</span>
            </div>
            <SegmentedControl label="Guru 분야" options={DOMAINS} value={domain} onChange={chooseDomain} className="mentor-shelf__domains" />
            <div role="button" tabIndex={0} className="mentor-shelf__reading hub-card-link" aria-label={`${guruCard.person} Moonlight 글 읽기`}
              onClick={() => setDetailCard(guruCard)} onKeyDown={event => openWithKeyboard(event, () => setDetailCard(guruCard))}>
              <h4 aria-live="polite">{guruCard.person}</h4>
              <p className="mentor-shelf__frame">{guruCard.frame}</p>
              <p className="mentor-shelf__copy">{guruCard.text}</p>
              <div className="mentor-shelf__use">
                <strong>써볼 때</strong>
                <p>{guruCard.useWhen}</p>
              </div>
              <div className="mentor-shelf__question">
                <strong>물어볼 질문</strong>
                <p>{guruCard.question}</p>
              </div>
              <span className="mentor-shelf__read-more">Moonlight 글 읽기 →</span>
            </div>
            <GuidanceSource source={guruCard.source} className="mentor-shelf__source" />
            <div className="mentor-shelf__actions">
              {newWindowReady && <Button variant="outline" size="md" onClick={showCurrentWindow}>새 시간대 관점 보기</Button>}
              {onGuidanceAsk && <Button variant="primary" size="md" onClick={() => onGuidanceAsk(guruCard)}>
                {domain === 'sales' ? '영업 Guru에게 질문 쓰기' : '브랜드 멘토에게 질문 쓰기'}
              </Button>}
              <Button variant="outline" size="md" onClick={() => setGuruOffset(value => value + 1)}>다른 관점</Button>
              <Button variant="ghost" size="md" onClick={() => showCards(false)}>이번 세션에서 숨기기</Button>
            </div>
          </Card>

          <Card role="article" aria-label="이번 주 Legend 카드" className="mentor-shelf__legend">
            <div className="mentor-shelf__card-head">
              <strong>LEGEND / 판단 관점</strong>
              <span className="mono">매주 한 장</span>
            </div>
            <div role="button" tabIndex={0} className="mentor-shelf__reading mentor-shelf__reading--legend hub-card-link" aria-label={`${legendCard.person} Moonlight 글 읽기`}
              onClick={() => setDetailCard(legendCard)} onKeyDown={event => openWithKeyboard(event, () => setDetailCard(legendCard))}>
              <div className="mentor-shelf__rule" aria-hidden="true" />
              <h4 aria-live="polite">{legendCard.person}</h4>
              <p className="mentor-shelf__frame">{legendCard.frame}</p>
              <p className="mentor-shelf__legend-copy">{legendCard.text}</p>
              <div className="mentor-shelf__question mentor-shelf__question--legend">
                <strong>생각해 볼 질문</strong>
                <p>{legendCard.question}</p>
              </div>
              <span className="mentor-shelf__read-more">Moonlight 글 읽기 →</span>
            </div>
            <div className="mentor-shelf__legend-bottom">
              <GuidanceSource source={legendCard.source} className="mentor-shelf__source" />
              <Button variant="ghost" size="md" onClick={() => setLegendOffset(value => value + 1)}>다른 Legend 보기 →</Button>
            </div>
          </Card>
        </div>
        <p className="mentor-shelf__foot">Guru 관점은 분야별로 지금 한 장씩 서울 기준 하루 세 번 준비됩니다. 읽는 동안 자동으로 넘어가지 않으며, 열람과 넘김은 조언·알림·업무를 생성하지 않습니다.</p>
      </>}
    </section>

    <section className="mentor-shelf__browse" aria-labelledby="mentor-shelf-browse">
      <div className="mentor-shelf__section-head">
        <div>
          <span className="mentor-shelf__eyebrow">EXPLORE / MENTOR ATLAS</span>
          <h3 id="mentor-shelf-browse" tabIndex={-1}>멘토 아틀라스</h3>
          <p>오늘의 카드에서 더 궁금해졌다면, 분야와 인물별로 찾아 읽어보세요.</p>
        </div>
        <span className="mono">{GURU_CARDS.length} Guru · {LEGEND_CARDS.length} Legend</span>
      </div>
      <div className="mentor-shelf__atlas-tools">
        <SegmentedControl label="멘토 탐색 방식" options={BROWSE_MODES} value={browseMode} onChange={setBrowseMode} className="mentor-shelf__browse-mode" />
        <TextField label="인물 또는 관점 검색" type="search" value={searchTerm} onChange={chooseSearch} placeholder="인물 또는 관점 검색" fieldClassName="mentor-shelf__search" />
      </div>
      <div className="mentor-shelf__people">
          <div className="mentor-shelf__people-head">
            <div>
              <strong>{browseDomainLabel} {browseMode === 'person' ? '멘토' : '관점'}</strong>
              <span>{browseMode === 'person' ? `검수 카드가 있는 인물 ${people.length}명` : `검수 카드 ${domainCards.length}장`} · 직접 골라 읽기</span>
            </div>
            <SegmentedControl label="탐색 분야" options={ATLAS_DOMAINS} value={browseDomain} onChange={chooseBrowseDomain} className="mentor-shelf__people-domains" />
          </div>
          <div className="mentor-shelf__people-layout">
            {browseMode === 'domain' ? <ul className="mentor-shelf__person-list" aria-label={`${browseDomainLabel} 분야 카드 목록`}>
              {domainCards.map(card => <li key={card.id}>
                <button
                  type="button"
                  id={`mentor-shelf-choice-domain-${card.id}`}
                  data-card-id={card.id}
                  className="mentor-shelf__person-choice mentor-shelf__person-choice--card hub-card-link"
                  aria-pressed={browseCard?.id === card.id}
                  aria-controls={browseCard?.id === card.id ? 'mentor-shelf-person-detail' : undefined}
                  onClick={() => setSelectedDomainCardId(card.id)}
                >
                  <strong>{methodLabel(card)}</strong>
                  <span>{personName(card)}</span>
                </button>
              </li>)}
            </ul> : <ul className="mentor-shelf__person-list" aria-label={`${browseDomainLabel} 멘토 목록`}>
              {people.map(person => {
                const count = browseDomain === 'legend' ? 1 : listGuidanceCardsForPerson(person.id).filter(card => card.domain === browseDomain).length;
                return <li key={person.id}>
                  <button
                    type="button"
                    id={`mentor-shelf-choice-person-${person.id}`}
                    className="mentor-shelf__person-choice hub-card-link"
                    aria-pressed={selectedPerson?.id === person.id}
                    aria-controls={selectedPerson?.id === person.id ? 'mentor-shelf-person-detail' : undefined}
                    onClick={() => choosePerson(person.id)}
                  >
                    <strong>{person.name}</strong>
                    <span>{count}장</span>
                  </button>
                </li>;
              })}
            </ul>}
            {browseCard ? <Card
              id="mentor-shelf-person-detail"
              role="region"
              tabIndex={-1}
              aria-label={`${personName(browseCard)} · ${methodLabel(browseCard)} 카드`}
              className="mentor-shelf__person-detail"
            >
              <div className="mentor-shelf__card-head">
                <strong>{browseDomainLabel.toUpperCase()} / {browseMode === 'person' ? '인물별' : '분야별'} 관점</strong>
                <div className="mentor-shelf__detail-tools">
                  <span className="mono">{browseCardPosition} / {browseCardCount}</span>
                  <Button variant="ghost" size="sm" className="mentor-shelf__return" onClick={returnToList}>목록으로 ↑</Button>
                </div>
              </div>
              <div role="button" tabIndex={0} className="mentor-shelf__reading hub-card-link" aria-label={`${browseCard.person} Moonlight 글 읽기`}
                onClick={() => setDetailCard(browseCard)} onKeyDown={event => openWithKeyboard(event, () => setDetailCard(browseCard))}>
                <h4>{personName(browseCard)}</h4>
                <p className="mentor-shelf__person-method">{methodLabel(browseCard)}</p>
                {browseCard.rotationEligible === false && <p className="mentor-shelf__manual-note">직접 선택해 읽는 관점 · 시간대 카드에는 나오지 않습니다.</p>}
                <p className="mentor-shelf__frame">{browseCard.frame}</p>
                <p className="mentor-shelf__copy">{browseCard.text}</p>
                <div className="mentor-shelf__use">
                  <strong>써볼 때</strong>
                  <p>{browseCard.useWhen}</p>
                </div>
                <div className="mentor-shelf__question">
                  <strong>{browseCard.kind === 'legend' ? '생각해 볼 질문' : '물어볼 질문'}</strong>
                  <p>{browseCard.question}</p>
                </div>
                <span className="mentor-shelf__read-more">Moonlight 글 읽기 →</span>
              </div>
              <GuidanceSource source={browseCard.source} className="mentor-shelf__source" />
              <div className="mentor-shelf__actions">
                {browseCard.kind === 'guru' && onGuidanceAsk && <Button variant="primary" size="md" onClick={() => onGuidanceAsk(browseCard)}>선택한 관점으로 질문 쓰기</Button>}
                {browseMode === 'person' && personCards.length > 1 && <Button variant="outline" size="md" onClick={() => setPersonOffset(value => value + 1)}>이 인물의 다른 카드</Button>}
              </div>
            </Card> : <Card pad={false} className="mentor-shelf__no-results"><EmptyState icon="search" title="검색 결과 없음" description="해당 인물이나 관점이 없습니다. 다른 검색어를 입력해 보세요." /></Card>}
          </div>
        </div>
    </section>
    {detailCard && <GuidanceDetail card={detailCard} onClose={() => setDetailCard(null)} onAsk={detailCard.kind === 'guru' ? onGuidanceAsk : undefined} />}
  </div>;
}
