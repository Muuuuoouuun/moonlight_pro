// 렌더러는 번들러 없이 file:// 로 뜬다. 공유 계약(pet/shared/contract.js)은 CommonJS라서
// 불러오기 직전에 전역 `module` 자리를 잠깐 만들고, contract-end.js 가 결과를 옮긴 뒤 지운다.
'use strict';
window.module = { exports: {} };
