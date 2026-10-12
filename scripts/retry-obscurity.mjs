// Re-fetch pageviews for entries with 0/0 (likely rate-limited); failures stored as null, never as 0.
import fs from 'node:fs';
const UA='BookGalaxy2/0.1 (https://github.com/VinceJan/Book-Galaxy-2)';const f='scripts/raw/obscurity.raw.json';const raw=JSON.parse(fs.readFileSync(f));
const [S,E]=raw.window;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function pv(p,t){if(!t)return 0;for(let i=0;i<6;i++){const r=await fetch(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${p}/all-access/user/${encodeURIComponent(t.replace(/ /g,'_'))}/monthly/${S}/${E}`,{headers:{'User-Agent':UA}});
 if(r.ok)return (await r.json()).items.reduce((a,x)=>a+x.views,0);if(r.status===404)return 0;await sleep(1500*(i+1));}return null}
const todo=Object.entries(raw.books).filter(([,x])=>!x.zhViews&&!x.enViews||x.zhViews===null||x.enViews===null);console.log('retry',todo.length);
let fail=0;for(const[id,x]of todo){x.zhViews=await pv('zh.wikipedia',x.zhTitle);x.enViews=await pv('en.wikipedia',x.enTitle);if(x.zhViews===null||x.enViews===null)fail++;await sleep(120)}
raw.retriedAt=new Date().toISOString();fs.writeFileSync(f,JSON.stringify(raw));console.log('fail',fail,'still zero',Object.values(raw.books).filter(x=>!x.zhViews&&!x.enViews).length);
