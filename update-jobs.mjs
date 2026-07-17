import { readFile, writeFile } from 'node:fs/promises';

const output = new URL('../daily-jobs.json', import.meta.url);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
const updatedAt = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false
}).format(new Date()).replaceAll('/', '-');
const headers = { 'user-agent': 'Mozilla/5.0 OfferFree/2.0 (+https://tjiale49-hub.github.io/offerfree/)' };
const platformNames = new Set(['应届生求职网', '中智招聘网', '中智招聘', '24365国家大学生就业服务平台', '国家公共招聘网', '国资委招聘', '企业招聘官网', '高校就业网', '智联招聘']);

const decode = s => String(s || '').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
const clean = s => decode(String(s || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
const inferIndustry = text => /银行|证券|保险|金融|基金/.test(text) ? '金融' : /互联网|软件|算法|数据|产品|运营/.test(text) ? '互联网' : /化工|材料|制药|生物/.test(text) ? '化工医药' : /汽车|机械|制造|工艺|质量|电气|自动化/.test(text) ? '制造业' : /教师|教育|培训/.test(text) ? '教育' : /建筑|地产|土木/.test(text) ? '建筑地产' : '其他';
const inferType = text => /实习/.test(text) ? '实习' : /社招|社会招聘/.test(text) ? '社招' : '校招';
const inferNature = text => /央企|国企|事业单位|研究所|银行/.test(text) ? '国企/事业单位' : /外企|外资/.test(text) ? '外企' : '其他';
const normalize = job => {
  const text = `${job.company || ''} ${job.title || ''} ${job.description || ''}`;
  return { ...job, industry: job.industry || inferIndustry(text), type: job.type || inferType(text), nature: job.nature || inferNature(text), discoveredAt: job.discoveredAt || today };
};

let previous = { items: [] };
try { previous = JSON.parse(await readFile(output, 'utf8')); } catch {}
const all = [];
const sourceStatus = [];

async function collectNcss() {
  const source = '24365国家大学生就业服务平台', found = [];
  let reachable = false;
  for (let offset = 1; offset <= 100; offset++) {
    try {
      const url = `https://job.ncss.cn/student/m/api/jobs/jobslist?offset=${offset}&limit=10&sourcesName=0`;
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      reachable = true;
      const payload = await response.json(), list = payload?.data?.list || [];
      if (!list.length) break;
      for (const job of list) found.push(normalize({
        company: job.corpName || '未公开单位', title: job.jobName || '招聘岗位', city: job.areaName || '全国',
        salary: job.lowMonthPay != null && job.highMonthPay != null ? `${job.lowMonthPay}-${job.highMonthPay}K` : '薪资面议',
        degree: job.degreeName || '不限', date: job.updateDate || today, deadline: '以原文为准', source,
        url: `https://job.ncss.cn/student/jobs/${job.jobId}/detail.html`,
        description: [job.property, job.corpScale, job.major].filter(Boolean).join(' · ')
      }));
      await new Promise(resolve => setTimeout(resolve, 180));
    } catch (error) {
      if (offset === 1) console.warn(`${source}: ${error.message}`);
      break;
    }
  }
  return { source, found, reachable };
}

async function collectHtmlSource(source, addresses, encoding = 'utf-8') {
  const found = []; let reachable = false;
  for (const address of addresses) {
    try {
      const response = await fetch(address, { headers, signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      reachable = true;
      const html = new TextDecoder(encoding).decode(await response.arrayBuffer()), base = new URL(address);
      for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const title = clean(match[2]);
        if (title.length < 5 || title.length > 110 || !/(招聘|校招|实习|管培|工程师|助理|专员|研发|设计|运营|教师|银行|集团|公司|研究院|岗位|公告)/.test(title)) continue;
        if (/(登录|注册|首页|帮助|协议|隐私|客服|资讯$|查看更多|求职干货)/.test(title)) continue;
        let url; try { url = new URL(decode(match[1]), base).href; } catch { continue; }
        if (!/^https?:/.test(url)) continue;
        const parts = title.split(/[｜|·—-]/).map(x => x.trim()).filter(Boolean);
        const company = parts[0] || '招聘单位待核验';
        if (platformNames.has(company) || platformNames.has(title) || /^(登录|注册|招聘首页|职位搜索)$/.test(title)) continue;
        found.push(normalize({ company, title, city: '全国', salary: '薪资面议', degree: '不限', date: today,
          deadline: '以原文为准', source, url, description: '公开招聘信息，详情及投递条件以来源平台原文为准。' }));
      }
    } catch (error) { console.warn(`${source}: ${address}: ${error.message}`); }
  }
  return { source, found, reachable };
}

const results = await Promise.all([
  collectNcss(),
  collectHtmlSource('应届生求职网', [
    'https://zhiwei.yingjiesheng.com/', 'https://zhiwei.yingjiesheng.com/summer/',
    'https://www.yingjiesheng.com/major/renli/', 'https://www.yingjiesheng.com/major/jixie/',
    'https://www.yingjiesheng.com/major/huagong/', 'https://www.yingjiesheng.com/major/jinrong/',
    'https://www.yingjiesheng.com/major/jisuanji/'
  ], 'utf-8'),
  collectHtmlSource('中智招聘网', [
    'https://www.ciiczhaopin.com/campus/index', 'https://www.ciiczhaopin.com/job/',
    'https://www.ciiczhaopin.com/company/', 'https://www.ciiczhaopin.com/campus/recruitment'
  ]),
  collectHtmlSource('国家公共招聘网', [
    'https://job.mohrss.gov.cn/', 'https://job.mohrss.gov.cn/cjobs/'
  ]),
  collectHtmlSource('国资委招聘', [
    'https://www.sasac.gov.cn/n2588035/n2588325/n2588350/index.html'
  ]),
  collectHtmlSource('高校就业网', [
    'https://career.nankai.edu.cn/', 'https://career.fzu.edu.cn/', 'https://career.xmu.edu.cn/'
  ]),
  collectHtmlSource('智联招聘', [
    'https://xiaoyuan.zhaopin.com/', 'https://www.zhaopin.com/'
  ])
]);

for (const result of results) {
  const unique = [...new Map(result.found.map(x => [`${x.source}|${x.title}|${x.url}`, x])).values()];
  const retained = previous.items.filter(x => x.source === result.source);
  // 保留历史有效条目，再合并本次新数据；这样岗位库会随每日同步持续增长，而不是每天只显示一页。
  all.push(...retained, ...unique);
  sourceStatus.push({ source: result.source, status: unique.length ? 'updated' : 'retained', count: unique.length || retained.length, checkedAt: updatedAt, reachable: result.reachable });
}

// “平台”只记录为来源，不生成平台占位岗位；公司名和岗位名必须是具体招聘主体与招聘事项。
const items = [...new Map(all.filter(x => !platformNames.has(x.company) && !platformNames.has(x.title))
  .map(x => [`${x.source}|${x.company}|${x.title}|${x.url}`, x])).values()]
  .sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 5000);
const retainedOfficial = previous.items.filter(x => /官网|官方/.test(x.source || ''));
sourceStatus.push({ source: '企业招聘官网', status: retainedOfficial.length ? 'retained' : 'manual', count: retainedOfficial.length, checkedAt: updatedAt, reachable: false });
await writeFile(output, JSON.stringify({ updatedAt, timezone: 'Asia/Shanghai', total: items.length, items, sourceStatus }, null, 2) + '\n', 'utf8');
console.log(`OfferFree daily update: ${items.length} items at ${updatedAt}`);
