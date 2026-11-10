import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { NAV_TREE, LEGACY_TREE, navPathForScope } from './hub-data.js';
import { SIDEBAR_PRIMARY, SIDEBAR_UTILITIES, topNavigationForRoute } from './hub-nav.js';
import { FINANCE_VIEWS, financeFilters } from './pages/finance-view.js';

const revenue=NAV_TREE.find(item=>item.key==='revenue');
const service=revenue.children.find(item=>item.key==='service-accounts');
const customer=revenue.children.find(item=>item.key==='accounts');

test('service/subscription account search opens the existing personal Finance ledger, never CRM Accounts',()=>{
  assert.equal(service.label,'서비스·구독 계정');
  assert.equal(service.path,'dashboard/revenue/cashflow?scope=personal&view=subscriptions');
  for(const scope of ['all','classin','personal'])assert.equal(navPathForScope(service,scope),service.path);
  for(const word of ['서비스','구독','계정','고정비','소비 내역'])assert.ok(service.keywords.includes(word));
  const params=new URLSearchParams(service.path.split('?')[1]);
  assert.equal(financeFilters(params).view,'subscriptions');
});

test('customer business Accounts keep their original destination and backward-compatible search terms',()=>{
  assert.equal(customer.label,'고객사·거래처 계정');
  assert.equal(customer.path,'dashboard/revenue/accounts');assert.ok(customer.keywords.includes('Accounts'));
  const palette=readFileSync(new URL('./hub-command-palette.jsx',import.meta.url),'utf8');
  const ast=ts.createSourceFile('hub-command-palette.jsx',palette,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
  let catalog;
  function visit(node) {
    if(ts.isVariableDeclaration(node) && node.name.getText(ast)==='items') catalog=node.initializer.arguments[0];
    ts.forEachChild(node,visit);
  }
  visit(ast);assert.ok(catalog,'exercise the actual command-palette catalog');
  for(const scope of ['all','classin','personal']) {
    const build=new Function('NAV_TREE','LEGACY_TREE','navPathForScope','scope',`return (${catalog.getText(ast)});`)(NAV_TREE,LEGACY_TREE,navPathForScope,scope);
    const action=build().find(item=>item.kind==='Action' && item.label==='고객사·거래처 계정 추가');
    assert.ok(action);assert.equal(action.icon,'accounts');
    assert.equal(action.path,`dashboard/revenue/accounts?new=account${scope==='all'?'':`&scope=${scope}`}`);
    assert.deepEqual(action.keywords,['New Account','계정','고객사','거래처']);
    const parsed=new URL(action.path,'https://synthetic.invalid/');
    assert.equal(parsed.pathname,'/dashboard/revenue/accounts');assert.equal(parsed.searchParams.get('new'),'account');
    assert.equal(parsed.searchParams.get('scope'),scope==='all'?null:scope);
  }
});

test('semantic separation does not add a sidebar anchor or revenue tab or change finance view keys',()=>{
  assert.equal(SIDEBAR_PRIMARY.length,10);assert.equal(SIDEBAR_UTILITIES.length,2);
  const nav=topNavigationForRoute('dashboard/revenue/cashflow?scope=personal&view=subscriptions','personal');
  assert.equal(nav.tabs.length,5);
  // 2026-10-19 현금 흐름 게이지(운영자 "다섯 안 모두 탭에 배치")가 `개인 소비` 보기를 더했다 — 화면 안 보기일 뿐 탑바 탭·사이드바는 그대로다.
  assert.deepEqual(FINANCE_VIEWS.map(view=>view.key),['flow','personal','subscriptions','claims']);
  assert.equal(FINANCE_VIEWS[0].label,'소비 내역');assert.equal(FINANCE_VIEWS[2].label,'구독·고정비');
});

test('Finance names the service alias without soliciting credentials or changing its review field',()=>{
  const source=readFileSync(new URL('./pages/finance.jsx',import.meta.url),'utf8');
  assert.match(source,/<TextField label="서비스 계정 별칭" value=\{draft.accountAlias\}/);
  assert.match(source,/hint="비밀번호·계좌번호 대신 구분할 이름"/);
  assert.match(source,/고객사·거래처 계정과 별도로 관리합니다/);
  assert.match(source,/구독·고정비 계약/);
  assert.doesNotMatch(source,/customer_accounts|\/api\/hub\/revenue/);
});
