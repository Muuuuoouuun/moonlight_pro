import assert from 'node:assert/strict';
import {test} from 'node:test';
import {contentQualityGeneration} from './content-quality.ts';
test('content generation has its own server setting, bounded reasoning and no automatic retries',()=>{
  const previous=process.env.COM_MOON_CONTENT_QUALITY_MODEL;
  try{
    delete process.env.COM_MOON_CONTENT_QUALITY_MODEL;
    assert.deepEqual(contentQualityGeneration(),{model:'gemini-3.1-pro-preview',thinkingLevel:'low',thinkingBudget:2048,maxOutputTokens:16384,retries:0});
    process.env.COM_MOON_CONTENT_QUALITY_MODEL='gemini-3.5-flash';
    assert.equal(contentQualityGeneration().model,'gemini-3.5-flash');
    process.env.COM_MOON_CONTENT_QUALITY_MODEL='https://untrusted.example/model';
    assert.equal(contentQualityGeneration().model,'gemini-3.1-pro-preview');
  }finally{
    if(previous===undefined)delete process.env.COM_MOON_CONTENT_QUALITY_MODEL;
    else process.env.COM_MOON_CONTENT_QUALITY_MODEL=previous;
  }
});
