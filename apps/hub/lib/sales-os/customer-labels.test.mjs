import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CUSTOMER_LABEL_MISSING, customerGenreOptions, customerRegionOptions, matchesCustomerLabels, normalizeGenreLabels } from './customer-labels.js';

test('customer filters support broad region, exact district, subject and genre', () => {
  const rows = [
    { region: '경기-안양', subjects: ['math', 'english'], genres: ['입시'] },
    { region: '경기-수원', subjects: ['arts-sports'], genres: ['예술'] },
    { region: '서울-강남', subjects: ['english'], genres: [] },
  ];
  assert.equal(matchesCustomerLabels(rows[0], { region: 'sido:경기', subject: 'math', genre: 'genre:입시' }), true);
  assert.equal(matchesCustomerLabels(rows[1], { region: 'exact:경기-안양' }), false);
  assert.equal(matchesCustomerLabels(rows[2], { subject: 'math' }), false);
  assert.deepEqual(customerRegionOptions(rows).map((option) => option.value), [
    '', CUSTOMER_LABEL_MISSING, 'sido:경기', 'exact:경기-수원', 'exact:경기-안양', 'sido:서울', 'exact:서울-강남',
  ]);
  assert.deepEqual(customerGenreOptions(rows).map((option) => option.value), [
    '', CUSTOMER_LABEL_MISSING, 'genre:예술', 'genre:입시',
  ]);
});

test('missing label filters expose customers who need classification', () => {
  const unlabeled = { region: '', subjects: [], genres: [] };
  const labeled = { region: '경기', subjects: ['math'], genres: ['입시'] };
  assert.equal(matchesCustomerLabels(unlabeled, { region: CUSTOMER_LABEL_MISSING, subject: CUSTOMER_LABEL_MISSING, genre: CUSTOMER_LABEL_MISSING }), true);
  assert.equal(matchesCustomerLabels(labeled, { region: CUSTOMER_LABEL_MISSING }), false);
  assert.equal(matchesCustomerLabels(labeled, { subject: CUSTOMER_LABEL_MISSING }), false);
  assert.equal(matchesCustomerLabels(labeled, { genre: CUSTOMER_LABEL_MISSING }), false);
});

test('genre labels trim and deduplicate without changing display spelling', () => {
  assert.deepEqual(normalizeGenreLabels([' 음악 ', '음악', 'Music', 'music', '', ' 디자인  교육 ']), [
    '음악', 'Music', '디자인 교육',
  ]);
  assert.deepEqual(normalizeGenreLabels(null), []);
});
