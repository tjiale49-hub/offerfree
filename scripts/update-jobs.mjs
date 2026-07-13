import { readFile, writeFile } from 'node:fs/promises';

const output = new URL('../daily-jobs.json', import.meta.url);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
const updatedAt = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false
}).format(new Date()).replaceAll('/', '-');

const sources = [
  { name: '应届生求职网', encoding: 'gbk', urls: ['https://zhiwei.yingjiesheng.com/summer/', 'https://www.yingjiesheng.com/major/renli/'] },
  { name: '中智招聘网', urls: ['https://www.ciiczhaopin.com/index'] },
  { name: '24365国家大学生就业服务平台', api: 'https://www.ncss.cn/student/m/api/jobs/jobslist?offset=1&limit=24&sourcesName=0', urls: [] }
];

const decode = (s) => s
  .replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
const clean = (s) => decode(s.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
const useful = (s) => s.length >= 6 && s.length <= 100 && /(招聘|实习|校招|管培|工程师|岗位|公告|助理|专员|研发|设计|运营|教师|银行|集团|公司)/.test(s) && !/(登录|注册|更多|首页|帮助|协议|隐私|客服|资讯$|求职干货)/.test(s);

let previous = { items: [] };
try { previous = JSON.parse(await readFile(output, 'utf8')); } catch {}

const result = [];
const sourceStatus = [];
for (const source of sources) {
  const found = [];
  let okCount = 0;
  if (source.api) {
    try {
      const response = await fetch(source.api, { headers: { 'user-agent': 'Mozilla/5.0 OfferFree/1.0 (+public recruitment index)' }, signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      for (const job of payload?.data?.list || []) {
        const title = `${job.corpName || ''} ${job.jobName || ''}`.replace(/\s+/g, ' ').trim();
        if (!title) continue;
        found.push({
          title,
          source: source.name,
          url: `https://www.ncss.cn/student/jobs/${job.jobId}/detail.html`,
          discoveredAt: today,
          meta: [job.areaName, job.degreeName, job.lowMonthPay != null && job.highMonthPay != null ? `${job.lowMonthPay}-${job.highMonthPay}K` : ''].filter(Boolean).join(' · ')
        });
      }
      okCount++;
    } catch (error) {
      console.warn(`${source.name}: API: ${error.message}`);
    }
  }
  for (const address of source.urls) {
    try {
      const response = await fetch(address, { headers: { 'user-agent': 'Mozilla/5.0 OfferFree/1.0 (+public recruitment index)' }, signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      const html = new TextDecoder(source.encoding || 'utf-8').decode(bytes);
      const base = new URL(address);
      for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const title = clean(match[2]);
        if (!useful(title)) continue;
        let url;
        try { url = new URL(decode(match[1]), base).href; } catch { continue; }
        if (!/^https?:/.test(url)) continue;
        found.push({ title, source: source.name, url, discoveredAt: today });
      }
      okCount++;
    } catch (error) {
      console.warn(`${source.name}: ${address}: ${error.message}`);
    }
  }
  const unique = [...new Map(found.map(x => [`${x.title}|${x.url}`, x])).values()].slice(0, 24);
  if (unique.length) result.push(...unique);
  else result.push(...previous.items.filter(x => x.source === source.name).slice(0, 24));
  sourceStatus.push({ source: source.name, status: unique.length ? 'updated' : 'retained', count: unique.length, checkedAt: updatedAt, reachable: okCount > 0 });
}

const items = [...new Map(result.map(x => [`${x.source}|${x.title}`, x])).values()].slice(0, 60);
await writeFile(output, JSON.stringify({ updatedAt, timezone: 'Asia/Shanghai', items, sourceStatus }, null, 2) + '\n', 'utf8');
console.log(`OfferFree daily update: ${items.length} items at ${updatedAt}`);
