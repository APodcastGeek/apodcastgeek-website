const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const {notionFetch,notionList,getBlocks,validateMetadata,blocksToHtml,assertApprovedCopy}=require('./build-blog');
const original=global.fetch;
test('HTTP failures and invalid list responses cannot look like empty content',async()=>{
 global.fetch=async()=>({ok:false,status:401});await assert.rejects(notionFetch('https://api.notion.com/v1/test'),/HTTP 401/);
 global.fetch=async()=>({ok:true,json:async()=>({object:'error'})});await assert.rejects(notionFetch('https://api.notion.com/v1/test'),/error response/);
 global.fetch=async()=>({ok:true,json:async()=>({has_more:false})});await assert.rejects(notionList('https://api.notion.com/v1/test'),/Invalid Notion list/);global.fetch=original;
});
test('database and block pagination include later pages',async()=>{
 let calls=[];global.fetch=async(url,opts)=>{calls.push({url,opts});return {ok:true,json:async()=>calls.length===1?{results:[{id:1}],has_more:true,next_cursor:'second'}:{results:[{id:2}],has_more:false}}};
 assert.equal((await notionList('https://api.notion.com/v1/databases/db/query',{filter:{}})).length,2);assert.equal(JSON.parse(calls[1].opts.body).start_cursor,'second');calls=[];
 assert.equal((await getBlocks('block')).length,2);assert.match(calls[1].url,/start_cursor=second/);global.fetch=original;
});
test('repeated cursors and nested blocks stop instead of truncating articles',async()=>{
 global.fetch=async()=>({ok:true,json:async()=>({results:[],has_more:true,next_cursor:'same'})});await assert.rejects(notionList('https://api.notion.com/v1/test'),/repeated/);
 global.fetch=async()=>({ok:true,json:async()=>({results:[{has_children:true}],has_more:false})});await assert.rejects(getBlocks('block'),/Nested/);global.fetch=original;
});
const page=(slug,date)=>({properties:{Name:{title:[{plain_text:'Article'}]},Slug:{rich_text:[{plain_text:slug}]},Description:{rich_text:[{plain_text:'Description'}]},'Publish Date':{rich_text:[{plain_text:date}]}}});
test('invalid dates, path traversal and duplicate slugs cannot write files',()=>{assert.throws(()=>validateMetadata([page('../escape','2026-11-06')]),/slug/);assert.throws(()=>validateMetadata([page('valid','2026-02-30')]),/date/);assert.throws(()=>validateMetadata([page('valid','2026-11-06'),page('valid','2026-11-06')]),/duplicate/);validateMetadata([page('valid','2026-11-06')]);});
test('current commitment stays three months; unsupported claims stop publication',()=>{const blocks=[{type:'paragraph',paragraph:{rich_text:[{plain_text:'3-month minimum'}]}}];assert.match(blocksToHtml(blocks),/3-month minimum/);for(const copy of ['6-month minimum','€1,099 per month','Guest recruitment add-on','10 business day turnaround'])assert.throws(()=>assertApprovedCopy(copy));assertApprovedCopy('Five captioned clips and an email newsletter. Clients pay their hosting subscription separately.');});
