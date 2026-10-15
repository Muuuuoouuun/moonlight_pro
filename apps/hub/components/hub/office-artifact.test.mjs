import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
let OfficeArtifact;
try { ({OfficeArtifact}=await import('./office-artifact.jsx')); } catch {}
const render=artifact=>{assert.equal(typeof OfficeArtifact,'function');return renderToStaticMarkup(React.createElement(OfficeArtifact,{artifact}));};
test('weekly markdown is a readable document below its report heading with literal hostile HTML and safe links',()=>{
  const html=render({kind:'markdown',body:'# 이번 주 판단\n\n연락 활동 **1건**\n\n- 신규 딜 0건\n\n[출처](https://example.org) [위험](javascript:alert(1))\n\n<script>alert(1)</script>'});
  assert.match(html,/<h4[^>]*>이번 주 판단<\/h4>/);assert.match(html,/<strong>1건<\/strong>/);assert.match(html,/<ul><li>신규 딜 0건<\/li><\/ul>/);
  assert.doesNotMatch(html,/<h[123][\s>]|<script|href="javascript/);assert.match(html,/&lt;script&gt;/);assert.match(html,/href="https:\/\/example\.org\/"/);
});
test('plain text, code and legacy documents retain literal content and do not reinterpret QA text',()=>{
  for(const kind of ['text',undefined]) {const html=render({kind,body:'## 원문\n**변경 금지** <div>'});assert.match(html,/## 원문/);assert.match(html,/\*\*변경 금지\*\*/);assert.match(html,/&lt;div&gt;/);assert.doesNotMatch(html,/<h4|<strong|<pre/);}
  const code=render({kind:'code',body:'<script>\n**literal**'});assert.match(code,/<pre/);assert.match(code,/&lt;script&gt;/);assert.match(code,/\*\*literal\*\*/);
});
test('the actual Office result view chooses markdown or literal code while keeping the original body for copying',async()=>{
  const source=await readFile(new URL('./office-workflow-panel.jsx',import.meta.url),'utf8');
  const ast=ts.createSourceFile('panel.jsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
  let resultNode;
  function find(node){if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(ast)==='article'&&node.getText(ast).includes('result.artifact'))resultNode=node;ts.forEachChild(node,find);}
  find(ast);assert.ok(resultNode);
  const compiled=ts.transpileModule(`function OfficeResult(){return (${resultNode.getText(ast)});}`,{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
  const button=({children})=>React.createElement('button',null,children), badge=()=>null;
  function renderResult(artifact){
    const deps={React,OfficeArtifact,result:{summary:'판단',artifact,uncertainties:[],dissent:[],evidence:[],nextStep:null},styles:{},receipt:{persistence:{persisted:true}},state:{copied:false},Button:button,TruthBadge:badge,CertaintyBadge:badge,OfficeDiscussion:badge,copy(){},openTask(){},hasApplication:false,isCustomer:false};
    const View=new Function(...Object.keys(deps),`${compiled};return OfficeResult;`)(...Object.values(deps));
    return renderToStaticMarkup(React.createElement(View));
  }
  const markdown=renderResult({kind:'markdown',body:'## 판단\n\n**실측 0건**'});assert.match(markdown,/<h5[^>]*>판단/);assert.match(markdown,/<strong>실측 0건/);
  const literal=renderResult({kind:'code',body:'**원문**'});assert.match(literal,/<pre[^>]*>\*\*원문\*\*<\/pre>/);
  const copyFunction=ast.statements.flatMap(node=>ts.isFunctionDeclaration(node)?[node]:[]).find(node=>node.name?.text==='WorkflowForOrigin');
  assert.ok(copyFunction.getText(ast).includes('navigator.clipboard.writeText(result.artifact.body)'));
});
