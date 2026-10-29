'use client';

import { OFFICE_ROSTER } from '@com-moon/agent-contracts/office';
import styles from './office-avatar.module.css';

const INITIALS = new Map(OFFICE_ROSTER.map(p => [p.id, Array.from(p.name)[0]]));

// 모노그램 타일 — 이름 첫 글자가 아이덴티티, 색으로 캐릭터를 구분하지 않는다(BrandMark 어휘).
export function OfficeAvatar({ agentId, size = 'default' }) {
  const initial = INITIALS.get(agentId);
  if (!initial) return null;
  const sizeClass = size === 'small' ? styles.small : size === 'large' ? styles.large : '';
  return <span className={[styles.avatar, sizeClass].filter(Boolean).join(' ')} aria-hidden="true">{initial}</span>;
}
