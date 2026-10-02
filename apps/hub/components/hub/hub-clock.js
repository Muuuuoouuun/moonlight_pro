const clockFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', weekday: 'short', month: 'numeric', day: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function formatHubClock(now) {
  const parts = Object.fromEntries(clockFormatter.formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.weekday} · ${parts.month}/${parts.day} · ${parts.hour}:${parts.minute}`;
}
