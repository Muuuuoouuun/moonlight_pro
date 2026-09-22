import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as calendar from './google-calendar.js';

const read = (items, calendarId = 'primary') => calendar.readCombinedGoogleCalendarEvents({
  readOauth: async () => ({ ok: true, items, calendarId }),
  readMergedSources: async () => ({ ok: true, items: [], sources: [] }),
});
test('calendar outcome identity survives title/time edits but separates calendars and instances', async () => {
  const event = { id: 'stable-id', summary: 'before', start: { dateTime: '2026-09-22T01:00:00Z' } };
  const a = (await read([event])).items[0];
  assert.match(a.outcomeKey || '', /^[a-f0-9]{64}$/);
  const b = (await read([{ ...event, summary: 'after', start: { dateTime: '2026-09-23T01:00:00Z' } }])).items[0];
  assert.equal(a.outcomeKey, b.outcomeKey);
  assert.notEqual(a.outcomeKey, (await read([event], 'other')).items[0].outcomeKey);
  assert.notEqual(a.outcomeKey, (await read([{ ...event, id: 'another-instance' }])).items[0].outcomeKey);
});
test('personal and company feeds cannot share an outcome even with identical event IDs', async () => {
  const result = await calendar.readCombinedGoogleCalendarEvents({
    readOauth: async () => ({ ok: false, items: [] }),
    readMergedSources: async () => ({ ok: true, sources: [], items: [
      { id: 'shared-uid', source: 'personal', start: { date: '2026-09-22' } },
      { id: 'shared-uid', source: 'company', start: { date: '2026-09-22' } },
    ] }),
  });
  assert.match(result.items[0].outcomeKey || '', /^[a-f0-9]{64}$/);
  assert.notEqual(result.items[0].outcomeKey, result.items[1].outcomeKey);
});

test('rescheduling one iCal recurrence preserves its original outcome identity', async () => {
  const { parseGoogleCalendarIcal } = await import('./google-calendar-ical.js');
  const feed = start => [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:weekly@example.com',
    'DTSTART:20260922T010000Z', 'DTEND:20260922T020000Z', 'RRULE:FREQ=WEEKLY;COUNT=3',
    'SUMMARY:Weekly', 'END:VEVENT', 'BEGIN:VEVENT', 'UID:weekly@example.com',
    'RECURRENCE-ID:20260922T010000Z', `DTSTART:${start}`, 'DURATION:PT1H',
    'SUMMARY:Weekly moved', 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const parse = start => parseGoogleCalendarIcal(feed(start), { timeMin: '2026-09-21T00:00:00Z', timeMax: '2026-09-30T00:00:00Z' });
  const before = await read(parse('20260922T010000Z'));
  const after = await read(parse('20260922T030000Z'));
  assert.equal(before.items.length, 2);
  assert.notEqual(before.items[0].start.dateTime, after.items[0].start.dateTime);
  assert.equal(before.items[0].outcomeKey, after.items[0].outcomeKey);
  assert.notEqual(after.items[0].outcomeKey, after.items[1].outcomeKey);
});
