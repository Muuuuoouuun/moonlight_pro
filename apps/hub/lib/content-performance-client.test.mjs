import test from 'node:test';
import assert from 'node:assert/strict';
import { performanceRows, parsePerformanceMetrics } from './content-performance-client.js';
test('period and brand/channel filters combine, including Monday across a year boundary',()=>{
 const rows=[{id:'a',brandId:'b',channel:'threads',publishedAt:'2025-12-31T16:00:00Z'},{id:'c',brandId:'b',channel:'x',publishedAt:'2026-01-02T00:00:00Z'},{id:'d',brandId:'b',channel:'threads',publishedAt:'2025-12-28T15:00:00Z'}];
 assert.deepEqual(performanceRows(rows,{view:'week',brand:'b',channel:'threads',year:2026},new Date('2026-01-03T00:00:00Z')).map(r=>r.id),['a','d']);
 assert.deepEqual(performanceRows(rows,{view:'monthly',brand:'b',channel:'threads',year:2026,month:'01'},new Date('2026-01-03T00:00:00Z')).map(r=>r.id),['a']);
});
test('manual metrics distinguish blank from real zero and reject malformed numbers',()=>{
 assert.deepEqual(parsePerformanceMetrics({views:'0',shares:'',replies:'12'}),{views:0,shares:null,replies:12});
 for(const views of ['-1','1.5','1e4','9007199254740992','NaN'])assert.throws(()=>parsePerformanceMetrics({views,shares:'',replies:''}));
 assert.throws(()=>parsePerformanceMetrics({views:'',shares:'',replies:''}));
});
