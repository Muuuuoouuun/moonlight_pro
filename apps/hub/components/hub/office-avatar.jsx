'use client';

import Image from 'next/image';
import { OFFICE_IDS } from '@com-moon/agent-contracts/office';
import styles from './office-avatar.module.css';

const AGENT_IDS = new Set(OFFICE_IDS);

export function OfficeAvatar({ agentId, size = 'default' }) {
  if (!AGENT_IDS.has(agentId)) return null;
  const sizeClass = size === 'small' ? styles.small : size === 'large' ? styles.large : '';
  return <span className={[styles.avatar, sizeClass].filter(Boolean).join(' ')} aria-hidden="true">
    <Image src={`/office/avatars/${agentId}.jpg`} alt="" width={64} height={64} unoptimized />
  </span>;
}
