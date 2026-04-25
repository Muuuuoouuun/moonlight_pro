"use client";

const I = {
  moon:      (<><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></>),
  sun:       (<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>),
  brief:     (<><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/></>),
  work:      (<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/></>),
  calendar:  (<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></>),
  projects:  (<><path d="M3 7h7l2 2h9v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7z"/></>),
  decisions: (<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></>),
  roadmap:   (<><path d="M4 6h10M4 12h16M4 18h7"/><circle cx="18" cy="6" r="1.5"/><circle cx="11" cy="18" r="1.5"/></>),
  rhythm:    (<><path d="M3 12h3l3-8 4 16 3-8h5"/></>),
  content:   (<><path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M15 4v4h4"/></>),
  studio:    (<><path d="M12 19l7-7 3 3-7 7H12v-3z"/><path d="M18 13l-1.5-1.5M3 3h10M3 8h10M3 13h6"/></>),
  queue:     (<><path d="M4 6h16M4 12h10M4 18h7"/><circle cx="19" cy="12" r="2"/><circle cx="14" cy="18" r="2"/></>),
  campaigns: (<><path d="M3 11l18-7v16l-18-7z"/><path d="M7 13v5"/></>),
  revenue:   (<><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></>),
  leads:     (<><circle cx="9" cy="9" r="4"/><path d="M17 11l2 2 4-4M2 20c0-4 3-6 7-6s7 2 7 6"/></>),
  deals:     (<><path d="M12 2l3 6 6 1-4.5 4.5 1 6.5-5.5-3-5.5 3 1-6.5L3 9l6-1z"/></>),
  cases:     (<><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></>),
  accounts:  (<><rect x="3" y="6" width="18" height="14" rx="1"/><path d="M3 10h18M8 6V4h8v2"/></>),
  automations: (<><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></>),
  email:     (<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>),
  webhook:   (<><path d="M15 12a3 3 0 1 0-6 0"/><path d="M9 12L5 19h9"/><path d="M15 12l4 7"/></>),
  runs:      (<><path d="M8 5v14l11-7z"/></>),
  agents:    (<><rect x="4" y="6" width="16" height="12" rx="3"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><path d="M12 2v4M8 18v3M16 18v3"/></>),
  chat:      (<><path d="M4 5h16v11H8l-4 4V5z"/></>),
  council:   (<><circle cx="7" cy="9" r="3"/><circle cx="17" cy="9" r="3"/><circle cx="12" cy="17" r="3"/></>),
  orders:    (<><rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 11 2 2 5-5M8 17h5"/></>),
  evolution: (<><path d="M3 20c2-8 6-14 9-14s7 6 9 14"/><circle cx="6" cy="17" r="1"/><circle cx="12" cy="10" r="1"/><circle cx="18" cy="17" r="1"/></>),
  settings:  (<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>),

  plus:      (<><path d="M12 5v14M5 12h14"/></>),
  check:     (<><path d="M5 12l5 5L20 7"/></>),
  x:         (<><path d="M6 6l12 12M6 18L18 6"/></>),
  arrowRight:(<><path d="M5 12h14M13 6l6 6-6 6"/></>),
  arrowUp:   (<><path d="M12 19V5M6 11l6-6 6 6"/></>),
  arrowDown: (<><path d="M12 5v14M6 13l6 6 6-6"/></>),
  chevronR:  (<><path d="M9 6l6 6-6 6"/></>),
  chevronD:  (<><path d="M6 9l6 6 6-6"/></>),
  chevronL:  (<><path d="M15 6l-6 6 6 6"/></>),
  search:    (<><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>),
  filter:    (<><path d="M3 6h18M7 12h10M10 18h4"/></>),
  more:      (<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>),
  moreV:     (<><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></>),
  star:      (<><path d="M12 3l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 18l-5.9 3 1.2-6.5L2.5 9.9 9.1 9z"/></>),
  bolt:      (<><path d="M13 2L3 14h7l-1 8 10-12h-7z"/></>),
  signal:    (<><path d="M3 18v-3M9 18V9M15 18V5M21 18v-2"/></>),
  clock:     (<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>),
  bell:      (<><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 1 0 4 0"/></>),
  play:      (<><path d="M6 4l14 8-14 8z"/></>),
  pause:     (<><path d="M7 5h3v14H7zM14 5h3v14h-3z"/></>),
  drag:      (<><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></>),
  link:      (<><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></>),
  upload:    (<><path d="M12 3v12M6 9l6-6 6 6M4 17v3h16v-3"/></>),
  download:  (<><path d="M12 3v12M18 9l-6 6-6-6M4 17v3h16v-3"/></>),
  send:      (<><path d="M3 3l18 9-18 9 3-9z"/><path d="M6 12h10"/></>),
  eye:       (<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>),
  edit:      (<><path d="M14 5l5 5L8 21H3v-5z"/></>),
  user:      (<><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>),
  building:  (<><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01M9 16h6"/></>),
  tag:       (<><path d="M20 12l-8 8-9-9V4h7z"/><circle cx="8" cy="8" r="1"/></>),
  folder:    (<><path d="M3 7h7l2 2h9v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7z"/></>),
  flag:      (<><path d="M4 3v18M4 4h12l-2 4 2 4H4"/></>),
  command:   (<><path d="M6 6h3a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2H6a2 2 0 1 1 0-4zM18 6h-3a2 2 0 0 0-2 2v0a2 2 0 0 0 2 2h3a2 2 0 1 0 0-4zM6 18h3a2 2 0 0 0 2-2v0a2 2 0 0 0-2-2H6a2 2 0 1 0 0 4zM18 18h-3a2 2 0 0 1-2-2v0a2 2 0 0 1 2-2h3a2 2 0 1 1 0 4z"/></>),
  lock:      (<><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 1 1 8 0v4"/></>),
  copy:      (<><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></>),
  globe:     (<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></>),
  sparkle:   (<><path d="M12 3l1.5 5 5 1.5-5 1.5L12 16l-1.5-5-5-1.5 5-1.5zM19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z"/></>),
  inbox:     (<><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7z"/></>),
  zap:       (<><path d="M13 2L3 14h7l-1 8 10-12h-7z"/></>),
  git:       (<><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="6" r="2"/><path d="M6 8v8M18 8a6 6 0 0 1-6 6h-6"/></>),
  archive:   (<><rect x="3" y="3" width="18" height="5" rx="1"/><rect x="4" y="8" width="16" height="13" rx="1"/><path d="M10 12h4"/></>),
};

export function Iconed({ name, size = 16, stroke = 1.5, style }) {
  const p = I[name];
  if (!p) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
         style={{ flexShrink: 0, ...style }}>
      {p}
    </svg>
  );
}
