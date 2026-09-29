// contract-begin.js 짝. 계약을 window.PetContract 로 고정하고 임시 `module` 을 지운다 —
// 남겨 두면 뒤따르는 모델 파일(Node·브라우저 겸용)이 브라우저에서 CommonJS 로 오인한다.
'use strict';
window.PetContract = Object.freeze(window.module.exports);
delete window.module;
