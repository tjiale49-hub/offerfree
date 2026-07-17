(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value = '') => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const safeUrl = value => { try { const url = new URL(value, location.href); return /^https?:$/.test(url.protocol) ? url.href : '#'; } catch { return '#'; } };
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayISO = today.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });

  const STORAGE = {
    saved: 'offerfree.saved.v6', applications: 'offerfree.applications.v6', profile: 'offerfree.profile.v3',
    resumeMeta: 'offerfree.resume.attachments.v3', resumeBindings: 'offerfree.resume.bindings.v2', todos: 'offerfree.todos.v2'
  };
  const STAGES = ['收藏库','待投递','已投递','笔试待考','面试待复盘','已拒','意向Offer','已拿Offer'];
  const SOURCE_DEFS = [
    ['应届生求职网','校招、实习、宣讲会与专业分类入口','https://www.yingjiesheng.com/'],
    ['中智招聘网','央国企、校园招聘与社会招聘公开信息','https://www.ciiczhaopin.com/'],
    ['24365国家大学生就业服务平台','教育部高校毕业生就业公共服务平台','https://job.ncss.cn/'],
    ['国家公共招聘网','人社公共招聘与就业服务信息','https://job.mohrss.gov.cn/'],
    ['国资委招聘','中央企业招聘公告和人事信息','https://www.sasac.gov.cn/n2588035/n2588325/n2588350/index.html'],
    ['企业招聘官网','职位状态与要求的最终核验来源','#jobs'],
    ['高校就业网','高校审核发布的校招与宣讲信息','https://career.nankai.edu.cn/'],
    ['智联招聘','校园招聘与社会招聘信息入口','https://www.zhaopin.com/']
  ];
  const PLATFORM_NAMES = new Set(['应届生求职网','中智招聘网','24365国家大学生就业服务平台','国家公共招聘网','国资委招聘','企业招聘官网','高校就业网','智联招聘','中智招聘']);
  const COMMON_CITIES = ['全国','北京','上海','天津','重庆','广州','深圳','杭州','南京','苏州','成都','武汉','西安','长沙','郑州','青岛','济南','合肥','福州','厦门','宁波','无锡','佛山','东莞','珠海','南昌','昆明','贵阳','南宁','海口','石家庄','太原','沈阳','大连','长春','哈尔滨','兰州','西宁','银川','乌鲁木齐','呼和浩特','拉萨','香港','澳门','其他'];
  const COMMON_INDUSTRIES = ['互联网/软件','人工智能/算法','半导体/芯片','电子/通信','机械/自动化','汽车/新能源','化工/材料','生物/医药','金融/银行/证券','建筑/土木','能源/电力','教育/科研','法律/公共管理','财务/审计','市场/传媒','供应链/物流','食品/农业','央国企综合','其他'];

  let jobs = [], filtered = [], visibleCount = 24, activePreset = 'all';
  let saved = read(STORAGE.saved, []), applications = read(STORAGE.applications, []), profile = read(STORAGE.profile, {}), todos = read(STORAGE.todos, []);

  function toast(message) {
    const node = $('#toast'); node.textContent = message; node.classList.add('on');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove('on'), 2200);
  }
  function parseDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
    const date = new Date(`${value}T00:00:00+08:00`); return Number.isNaN(date.getTime()) ? null : date;
  }
  function daysUntil(value) { const date = parseDate(value); return date ? Math.ceil((date - today) / 86400000) : null; }
  function sourceGroup(source = '') {
    if (/应届生/.test(source)) return '应届生求职网';
    if (/中智/.test(source)) return '中智招聘网';
    if (/24365|国家大学生就业/.test(source)) return '24365国家大学生就业服务平台';
    if (/国家公共招聘|人力资源.*社会保障/.test(source)) return '国家公共招聘网';
    if (/国资委/.test(source)) return '国资委招聘';
    if (/大学|学院|高校.*就业|就业指导/.test(source)) return '高校就业网';
    if (/智联/.test(source)) return '智联招聘';
    if (/官网|官方|招聘网站|企业招聘/.test(source)) return '企业招聘官网';
    return source || '其他来源';
  }
  function normalize(raw, index) {
    const text = `${raw.company || raw.c || ''} ${raw.title || raw.t || ''} ${raw.description || raw.desc || ''}`;
    const industry = raw.industry || (/芯片|半导体/.test(text) ? '半导体/芯片' : /算法|人工智能|AI/.test(text) ? '人工智能/算法' : /软件|互联网|产品|运营/.test(text) ? '互联网/软件' : /银行|证券|金融|保险/.test(text) ? '金融/银行/证券' : /化工|材料/.test(text) ? '化工/材料' : /医药|生物/.test(text) ? '生物/医药' : /汽车|新能源/.test(text) ? '汽车/新能源' : /机械|自动化|制造|工艺/.test(text) ? '机械/自动化' : /教师|学校|教育/.test(text) ? '教育/科研' : /建筑|土木/.test(text) ? '建筑/土木' : '其他');
    const company = String(raw.company || raw.c || '').trim() || '招聘单位待核验';
    const title = String(raw.title || raw.t || '').trim() || '招聘岗位';
    const url = safeUrl(raw.url || raw.link || '#');
    return {
      id: `${sourceGroup(raw.source)}|${company}|${title}|${url}`,
      company, title, url, city: raw.city || '全国', salary: raw.salary || raw.s || '薪资面议', degree: raw.degree || '不限',
      date: raw.date || raw.discoveredAt || '', deadline: raw.deadline || '以原文为准', industry, nature: raw.nature || (/央企/.test(text) ? '央企' : /国企|事业单位|研究所/.test(text) ? '国企/事业单位' : /外企|外资/.test(text) ? '外企' : '其他'),
      year: raw.year || (/2027|27届/.test(text) ? '2027届' : /2026|26届/.test(text) ? '2026届' : '不限'),
      type: raw.type || (/实习/.test(text) ? '实习' : /社招|社会招聘/.test(text) ? '社招' : /提前批/.test(text) ? '提前批' : '校招'),
      major: raw.major || '专业要求以原文为准', source: sourceGroup(raw.source || ''), originalSource: raw.source || '公开来源',
      description: raw.description || raw.desc || '公开招聘信息，完整职责与任职要求请在来源平台原文中核验。',
      requirements: raw.requirements || raw.req || '学历、专业、毕业时间与招聘状态以招聘方最新说明为准。',
      tags: Array.isArray(raw.tags) ? raw.tags.slice(0, 4) : [], verified: url !== '#', index
    };
  }
  function isPlatformPlaceholder(job) {
    const generic = /招聘(信息|职位)?(聚合)?入口|平台入口|公开招聘平台$/.test(job.title);
    return PLATFORM_NAMES.has(job.company) || (PLATFORM_NAMES.has(job.title) && generic) || (!job.company && generic);
  }
  function dedupe(list) { const map = new Map(); list.forEach(job => { if (!isPlatformPlaceholder(job) && job.url !== '#') map.set(job.id, job); }); return [...map.values()]; }
  function jobKey(job) { return job.id; }
  function salaryValue(value = '') { const matches = String(value).match(/\d+(?:\.\d+)?/g); return matches ? Math.max(...matches.map(Number)) : 0; }
  function matchScore(job) {
    if (!Object.keys(profile).length) return 0;
    let score = 42, checks = 0;
    const add = (condition, points) => { checks++; if (condition) score += points; };
    add(!profile.city || profile.city === '全国' || String(job.city).includes(profile.city) || job.city === '全国', 14);
    add(!profile.industry || job.industry.includes(profile.industry) || `${job.major} ${job.title}`.includes(profile.industry), 14);
    add(!profile.year || profile.year === '不限' || job.year === '不限' || job.year.includes(profile.year.replace('届','')), 10);
    add(!profile.degree || profile.degree === '不限' || job.degree === '不限' || job.degree.includes(profile.degree), 10);
    const skills = String(profile.skills || '').split(/[，,、\s]+/).filter(Boolean);
    if (skills.length) score += Math.min(10, skills.filter(skill => `${job.title} ${job.major} ${job.description}`.toLowerCase().includes(skill.toLowerCase())).length * 4);
    return Math.min(98, Math.max(checks ? score : 0, 0));
  }

  async function loadJobs() {
    try {
      const response = await fetch(`daily-jobs.json?v=${todayISO}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      jobs = dedupe((data.items || []).map(normalize));
      $('#updatedAt').textContent = `最近更新：${data.updatedAt || todayISO} · Asia/Shanghai`;
      $('#syncText').textContent = `公开岗位库已就绪 · ${jobs.length} 条有效记录`;
      renderSourceHealth(data.sourceStatus || []);
    } catch (error) {
      jobs = [];
      $('#syncText').textContent = '岗位数据暂时无法读取';
      $('#updatedAt').textContent = '请通过 GitHub Pages 或本地服务器打开';
      renderSourceHealth([]);
    }
    populateFilters(); updateStats(); applyFilters(); renderWorkspace();
  }
  function populateSelect(id, values) {
    const select = $(id), current = select.value;
    const label = select.options[0].textContent;
    select.innerHTML = `<option value="">${esc(label)}</option>${[...new Set(values.filter(Boolean))].map(value => `<option>${esc(value)}</option>`).join('')}`;
    select.value = current;
  }
  function populateFilters() {
    populateSelect('#city', [...COMMON_CITIES, ...jobs.flatMap(job => String(job.city).split(/[、,，/]/).map(x => x.trim()))]);
    populateSelect('#industry', [...COMMON_INDUSTRIES, ...jobs.map(job => job.industry)]);
    populateSelect('#source', [...SOURCE_DEFS.map(x => x[0]), ...jobs.map(job => job.source)]);
  }
  function updateStats() {
    $('#count').textContent = jobs.length.toLocaleString('zh-CN');
    $('#today').textContent = jobs.filter(job => job.date === todayISO).length;
    $('#companyCount').textContent = new Set(jobs.map(job => job.company)).size.toLocaleString('zh-CN');
    renderDeadlines();
  }
  function presetMatches(job) {
    if (activePreset === '27') return job.year.includes('2027') || /27届/.test(`${job.title} ${job.description}`);
    if (activePreset === '26') return job.year.includes('2026') || /26届|补录/.test(`${job.title} ${job.description}`);
    if (activePreset === 'intern') return job.type === '实习' || /实习/.test(job.title);
    if (activePreset === 'state') return /央企|国企|事业单位/.test(job.nature);
    return true;
  }
  function filterMatches(job) {
    const q = $('#q').value.trim().toLowerCase();
    const haystack = `${job.company} ${job.title} ${job.city} ${job.industry} ${job.major} ${job.description} ${job.nature} ${job.year}`.toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    const simple = [['#city','city'],['#industry','industry'],['#degree','degree'],['#year','year'],['#type','type'],['#nature','nature'],['#source','source']];
    return presetMatches(job) && tokens.every(token => haystack.includes(token)) && simple.every(([id, key]) => {
      const value = $(id).value; if (!value) return true;
      if (id === '#degree') return job[key] === '不限' || job[key].includes(value);
      return String(job[key]).includes(value);
    });
  }
  function applyFilters(reset = true) {
    if (reset) visibleCount = 24;
    filtered = jobs.filter(filterMatches);
    const sort = $('#sort').value;
    filtered.sort((a,b) => {
      if (sort === 'deadline') return (parseDate(a.deadline)?.getTime() || Infinity) - (parseDate(b.deadline)?.getTime() || Infinity);
      if (sort === 'match') return matchScore(b) - matchScore(a);
      if (sort === 'salary') return salaryValue(b.salary) - salaryValue(a.salary);
      return String(b.date).localeCompare(String(a.date));
    });
    renderJobs(); renderRanks(); updateFilterBadge();
  }
  function updateFilterBadge() {
    const count = $$('#filters select').filter(select => select.value && select.id !== 'sort').length + (activePreset !== 'all' ? 1 : 0);
    $('#activeFilterCount').textContent = count;
  }
  function renderJobs() {
    $('#resultText').textContent = `找到 ${filtered.length.toLocaleString('zh-CN')} 条岗位`;
    const slice = filtered.slice(0, visibleCount);
    $('#jobList').innerHTML = slice.length ? slice.map(job => {
      const days = daysUntil(job.deadline), score = matchScore(job), key = jobKey(job), isSaved = saved.includes(key);
      const danger = days !== null && days >= 0 && days <= 7;
      const typeClass = job.type === '实习' ? 'intern' : /央企|国企/.test(job.nature) ? 'state' : /互联网|软件/.test(job.industry) ? 'internet' : '';
      return `<article class="job-card" tabindex="0" data-job="${esc(key)}" aria-label="${esc(job.company)} ${esc(job.title)}">
        <div class="company-mark" aria-hidden="true">${esc(job.company.slice(0,1))}</div>
        <div><div class="job-title-row"><h3>${esc(job.company)}</h3>${job.verified?'<span class="verified">来源可追溯</span>':''}</div><p class="job-name">${esc(job.title)}</p>
        <div class="job-meta"><span>📍 ${esc(job.city)}</span><span>🎓 ${esc(job.degree)}</span><span>💰 ${esc(job.salary)}</span><span>来源：${esc(job.source)}</span></div>
        <div class="tags"><span class="tag ${typeClass}">${esc(job.type)}</span><span class="tag ${typeClass}">${esc(job.nature)}</span><span class="tag">${esc(job.year)}</span><span class="tag">${esc(job.industry)}</span>${danger?'<span class="tag danger">7天内截止</span>':''}</div></div>
        <div class="job-side">${score?`<span class="match-score" style="--score:${score}"><span>${score}%</span></span>`:''}<span class="deadline ${danger?'soon':''}">${days!==null?(days<0?'已过期':days===0?'今天截止':`${days}天后截止`):esc(job.deadline)}</span></div>
        <div class="job-actions"><button class="icon-button ${isSaved?'saved':''}" data-save="${esc(key)}" type="button">${isSaved?'★ 已收藏':'☆ 收藏'}</button><button class="icon-button" data-apply="${esc(key)}" type="button">加入投递</button></div>
      </article>`;
    }).join('') : '<div class="empty"><strong>没有找到符合条件的岗位</strong><br><small>试试减少筛选条件，或换一个更宽泛的关键词。</small></div>';
    $('#loadMore').hidden = visibleCount >= filtered.length;
    bindJobEvents();
  }
  function bindJobEvents() {
    $$('.job-card').forEach(card => {
      card.addEventListener('click', event => { if (!event.target.closest('button')) openJob(card.dataset.job); });
      card.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('button')) { event.preventDefault(); openJob(card.dataset.job); } });
    });
    $$('[data-save]').forEach(button => button.onclick = () => toggleSaved(button.dataset.save));
    $$('[data-apply]').forEach(button => button.onclick = () => addApplication(button.dataset.apply));
  }
  function renderRanks() {
    const counts = {}; filtered.forEach(job => String(job.city).split(/[、,，/]/).forEach(city => counts[city.trim()] = (counts[city.trim()] || 0) + 1));
    const rows = Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0,6), max = rows[0]?.[1] || 1;
    $('#cityRank').innerHTML = rows.map(([name,count]) => `<div class="rank"><span>${esc(name)}</span><b>${count}</b><div class="rank-meter"><i style="width:${count/max*100}%"></i></div></div>`).join('') || '<small>暂无分布数据</small>';
  }
  function renderDeadlines() {
    const upcoming = jobs.filter(job => { const days = daysUntil(job.deadline); return days !== null && days >= 0 && days <= 45; }).sort((a,b) => daysUntil(a.deadline) - daysUntil(b.deadline)).slice(0,3);
    $('#deadlineList').innerHTML = upcoming.length ? upcoming.map(job => `<article class="deadline-card" data-deadline-job="${esc(jobKey(job))}"><div class="deadline-days"><div><strong>${daysUntil(job.deadline)}</strong><br>天</div></div><div><h3>${esc(job.company)}</h3><p>${esc(job.title)}<br>${esc(job.deadline)} 截止</p></div></article>`).join('') : '<div class="empty" style="grid-column:1/-1">暂无未来 45 天内已核实的固定截止日期；“招满即止”岗位建议优先投递。</div>';
    $$('[data-deadline-job]').forEach(card => card.onclick = () => openJob(card.dataset.deadlineJob));
  }
  function openJob(key) {
    const job = jobs.find(item => jobKey(item) === key); if (!job) return;
    const score = matchScore(job), same = jobs.filter(item => item.company === job.company && item.id !== job.id).slice(0,3);
    $('#detail').innerHTML = `<div class="detail-head"><span class="tag ${job.type==='实习'?'intern':''}">${esc(job.type)}</span><h2 id="drawerTitle">${esc(job.company)}</h2><p>${esc(job.title)}</p></div>
      ${score?`<div class="detail-section"><h3>与你的求职画像匹配度</h3><p><strong>${score}%</strong> · 匹配结果仅供筛选参考，请以岗位硬性要求为准。</p></div>`:''}
      <div class="detail-grid"><div><small>工作地点</small><strong>${esc(job.city)}</strong></div><div><small>学历要求</small><strong>${esc(job.degree)}</strong></div><div><small>薪资</small><strong>${esc(job.salary)}</strong></div><div><small>截止时间</small><strong>${esc(job.deadline)}</strong></div><div><small>届别</small><strong>${esc(job.year)}</strong></div><div><small>信息来源</small><strong>${esc(job.source)}</strong></div></div>
      <section class="detail-section"><h3>JD 摘要</h3><p>${esc(job.description)}</p></section><section class="detail-section"><h3>专业与要求</h3><p>${esc(job.major)}\n${esc(job.requirements)}</p></section>
      <section class="detail-section"><h3>风险提示</h3><p>投递前核验招聘主体、工作地点、用工性质与截止时间。收费内推、先交费培训、私人账户转账均需高度警惕。</p></section>
      ${same.length?`<section class="detail-section"><h3>同公司其他岗位</h3><p>${same.map(item=>`${esc(item.title)} · ${esc(item.city)}`).join('\n')}</p></section>`:''}
      <div class="detail-actions"><a href="${esc(job.url)}" target="_blank" rel="noopener noreferrer">打开原文 / 官方投递 ↗</a><button id="detailApply" type="button">加入投递清单</button></div>`;
    $('#drawerBg').hidden = false; document.body.style.overflow = 'hidden'; $('#drawerClose').focus();
    $('#detailApply').onclick = () => addApplication(key);
  }
  function closeDrawer() { $('#drawerBg').hidden = true; document.body.style.overflow = ''; }
  function toggleSaved(key) {
    saved = saved.includes(key) ? saved.filter(item => item !== key) : [...saved, key]; write(STORAGE.saved, saved); renderJobs(); toast(saved.includes(key) ? '已加入收藏库' : '已取消收藏');
  }
  function addApplication(key) {
    const job = jobs.find(item => jobKey(item) === key); if (!job) return;
    if (applications.some(item => item.jobId === key)) return toast('该岗位已在投递管理中');
    applications.unshift({ id: `a${Date.now()}`, jobId:key, company:job.company, title:job.title, stage:'待投递', savedAt:new Date().toISOString(), appliedAt:'', examAt:'', interviewAt:'', referral:'', hrEmail:'', notes:'' });
    write(STORAGE.applications, applications); renderWorkspace(); toast('已加入投递管理');
  }

  function renderWorkspace() { renderApplications(); renderResumes(); renderProfile(); renderTodos(); }
  function renderApplications() {
    const node = $('#work-applications');
    node.innerHTML = `<div class="kanban">${STAGES.map(stage => `<section class="kanban-col"><h4>${stage} · ${applications.filter(item=>item.stage===stage).length}</h4>${applications.filter(item=>item.stage===stage).map(item=>`<article class="application-item"><strong>${esc(item.company)}</strong><small>${esc(item.title)}</small><select data-stage="${item.id}">${STAGES.map(option=>`<option ${option===item.stage?'selected':''}>${option}</option>`).join('')}</select><div class="workspace-actions"><button class="secondary-button" data-note="${item.id}">记录</button><button class="danger-button" data-delete-app="${item.id}">删除</button></div></article>`).join('')}</section>`).join('')}</div><div class="workspace-actions"><button class="primary-button" id="exportApplications">导出投递 CSV</button></div>`;
    $$('[data-stage]',node).forEach(select => select.onchange = () => { const item=applications.find(x=>x.id===select.dataset.stage); item.stage=select.value; if(select.value==='已投递'&&!item.appliedAt)item.appliedAt=todayISO; write(STORAGE.applications,applications); renderWorkspace(); });
    $$('[data-delete-app]',node).forEach(button => button.onclick = () => { applications=applications.filter(x=>x.id!==button.dataset.deleteApp); write(STORAGE.applications,applications); renderWorkspace(); });
    $$('[data-note]',node).forEach(button => button.onclick = () => openApplicationForm(button.dataset.note));
    $('#exportApplications').onclick = exportApplications;
  }
  function openApplicationForm(id) {
    const item=applications.find(x=>x.id===id); if(!item)return;
    openModal(`<h2 id="modalTitle">投递记录</h2><p class="modal-note">${esc(item.company)} · ${esc(item.title)}</p><div class="form-grid"><label>投递时间<input id="fApplied" type="date" value="${esc(item.appliedAt)}"></label><label>笔试时间<input id="fExam" type="datetime-local" value="${esc(item.examAt)}"></label><label>面试时间<input id="fInterview" type="datetime-local" value="${esc(item.interviewAt)}"></label><label>内推码<input id="fReferral" value="${esc(item.referral)}"></label><label>HR邮箱<input id="fHr" type="email" value="${esc(item.hrEmail)}"></label><label class="wide">面试问题 / 回答不足 / 改进方向<textarea id="fNotes">${esc(item.notes)}</textarea></label></div><div class="workspace-actions"><button class="primary-button" id="saveApplicationNote">保存记录</button></div>`);
    $('#saveApplicationNote').onclick=()=>{Object.assign(item,{appliedAt:$('#fApplied').value,examAt:$('#fExam').value,interviewAt:$('#fInterview').value,referral:$('#fReferral').value.trim(),hrEmail:$('#fHr').value.trim(),notes:$('#fNotes').value.trim()});write(STORAGE.applications,applications);closeModal();renderWorkspace();toast('投递记录已保存')};
  }
  function exportApplications(){const cols=['公司','岗位','状态','投递时间','笔试时间','面试时间','内推码','HR邮箱','复盘笔记'];const rows=applications.map(x=>[x.company,x.title,x.stage,x.appliedAt,x.examAt,x.interviewAt,x.referral,x.hrEmail,x.notes]);const csv='\ufeff'+[cols,...rows].map(row=>row.map(v=>`"${String(v||'').replaceAll('"','""')}"`).join(',')).join('\n');downloadBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}),'OfferFree-投递记录.csv')}

  function openDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open('offerfree-files',3);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('resumes'))request.result.createObjectStore('resumes')};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
  async function dbPut(id,file){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction('resumes','readwrite');tx.objectStore('resumes').put(file,id);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)})}
  async function dbGet(id){const db=await openDb();return new Promise((resolve,reject)=>{const request=db.transaction('resumes').objectStore('resumes').get(id);request.onsuccess=()=>{db.close();resolve(request.result)};request.onerror=()=>reject(request.error)})}
  async function dbDelete(id){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction('resumes','readwrite');tx.objectStore('resumes').delete(id);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)})}
  function renderResumes(){const node=$('#work-resumes'),items=read(STORAGE.resumeMeta,[]);node.innerHTML=`<h3>附件简历版本库</h3><p class="modal-note">仅保留 PDF / Word 附件版本，不提供文字版简历编辑器。文件保存在当前浏览器；接入真实账号服务后可加密云同步。</p><div class="form-grid"><label>版本名称<input id="resumeName" placeholder="例如：化工工艺版"></label><label>目标岗位 / JD方向<input id="resumeTarget" placeholder="例如：工艺工程师"></label><label>选择附件<input id="resumeFile" type="file" accept=".pdf,.doc,.docx"></label></div><div class="workspace-actions"><button class="primary-button" id="saveResume">保存新版本</button></div><div class="resume-list">${items.length?items.map(item=>`<div class="resume-row"><div><strong>${esc(item.name)}</strong><small>${esc(item.target||'通用')} · ${esc(item.fileName)} · ${Math.max(1,Math.round(item.size/1024))} KB</small></div><div class="workspace-actions"><button class="secondary-button" data-open-resume="${item.id}">查看</button><button class="danger-button" data-delete-resume="${item.id}">删除</button></div></div>`).join(''):'<div class="empty">还没有附件简历版本</div>'}</div>`;
    $('#saveResume').onclick=async()=>{const name=$('#resumeName').value.trim(),target=$('#resumeTarget').value.trim(),file=$('#resumeFile').files[0];if(!name||!file)return toast('请填写版本名称并选择附件');if(file.size>15*1024*1024)return toast('单个文件不能超过 15 MB');const id=`r${Date.now()}`;await dbPut(id,file);items.unshift({id,name,target,fileName:file.name,size:file.size,updatedAt:new Date().toISOString()});write(STORAGE.resumeMeta,items);renderResumes();toast('简历附件已保存')};
    $$('[data-open-resume]',node).forEach(button=>button.onclick=async()=>{const file=await dbGet(button.dataset.openResume);if(!file)return toast('没有找到附件');const url=URL.createObjectURL(file);window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000)});
    $$('[data-delete-resume]',node).forEach(button=>button.onclick=async()=>{await dbDelete(button.dataset.deleteResume);write(STORAGE.resumeMeta,items.filter(x=>x.id!==button.dataset.deleteResume));renderResumes()});
  }
  function renderProfile(){const node=$('#work-profile');node.innerHTML=`<h3>求职画像与 JD 匹配</h3><p class="modal-note">匹配分数在浏览器内根据城市、行业/专业、学历、届别和技能关键词计算，不上传简历内容。</p><div class="form-grid"><label>学历<select id="pDegree"><option>不限</option><option>大专</option><option>专升本</option><option>本科</option><option>硕士</option><option>博士</option></select></label><label>专业 / 行业<input id="pIndustry" value="${esc(profile.industry||'')}" placeholder="例如：化工、计算机"></label><label>目标城市<input id="pCity" value="${esc(profile.city||'')}" placeholder="例如：上海"></label><label>毕业届别<select id="pYear"><option>不限</option><option>2026届</option><option>2027届</option><option>2028届及以后</option></select></label><label class="wide">技能关键词<input id="pSkills" value="${esc(profile.skills||'')}" placeholder="Python、AutoCAD、数据分析、财务"></label></div><div class="workspace-actions"><button class="primary-button" id="saveProfile">保存画像并重新匹配</button></div>`;$('#pDegree').value=profile.degree||'不限';$('#pYear').value=profile.year||'不限';$('#saveProfile').onclick=()=>{profile={degree:$('#pDegree').value,industry:$('#pIndustry').value.trim(),city:$('#pCity').value.trim(),year:$('#pYear').value,skills:$('#pSkills').value.trim()};write(STORAGE.profile,profile);applyFilters();toast('求职画像已保存')};}
  function renderTodos(){const auto=[];jobs.filter(job=>{const d=daysUntil(job.deadline);return d!==null&&d>=0&&d<=3&&!applications.some(a=>a.jobId===job.id)}).slice(0,3).forEach(job=>auto.push({id:`auto-${job.id}`,text:`${job.company} ${job.title} 即将截止`,done:false,auto:true}));applications.filter(a=>a.stage==='面试待复盘'&&!a.notes).forEach(a=>auto.push({id:`review-${a.id}`,text:`完成 ${a.company} 面试复盘`,done:false,auto:true}));const all=[...auto,...todos];const node=$('#work-todos');node.innerHTML=`<div class="todo-list">${all.length?all.map(item=>`<label class="todo ${item.done?'done':''}"><input type="checkbox" data-todo="${esc(item.id)}" ${item.done?'checked':''} ${item.auto?'disabled':''}><span>${esc(item.text)}</span></label>`).join(''):'<div class="empty">今天没有自动待办</div>'}</div><div class="form-grid" style="margin-top:12px"><label class="wide">自定义待办<input id="newTodo" placeholder="例如：修改化工版简历"></label></div><div class="workspace-actions"><button class="primary-button" id="addTodo">添加待办</button></div>`;$$('[data-todo]:not(:disabled)',node).forEach(input=>input.onchange=()=>{const item=todos.find(x=>x.id===input.dataset.todo);item.done=input.checked;write(STORAGE.todos,todos);renderTodos()});$('#addTodo').onclick=()=>{const text=$('#newTodo').value.trim();if(!text)return;todos.push({id:`t${Date.now()}`,text,done:false});write(STORAGE.todos,todos);renderTodos()};}

  function renderSourceHealth(statuses){const map=new Map(statuses.map(x=>[sourceGroup(x.source),x]));$('#sourceGrid').innerHTML=SOURCE_DEFS.map(([name,description,url])=>{const status=map.get(name);return `<article class="source-card"><div class="source-head"><h3>${esc(name)}</h3><span class="health">${status?.reachable?'已连接':status?'历史保留':'待接入'}</span></div><p>${esc(description)}${status?.count?` · 当前 ${status.count} 条`:''}</p><a href="${esc(url)}" ${url.startsWith('http')?'target="_blank" rel="noopener noreferrer"':''}>访问来源 ↗</a></article>`}).join('')}
  function openModal(html){$('#modalContent').innerHTML=html;$('#modalBg').hidden=false;document.body.style.overflow='hidden';$('#modalClose').focus()}
  function closeModal(){ $('#modalBg').hidden=true;document.body.style.overflow=''; }
  function openFeedback(){openModal(`<h2 id="modalTitle">私密反馈</h2><p class="modal-note">反馈不会进入公开建议箱。点击发送后将调用你的邮件客户端，由你确认后发送给站长。</p><div class="feedback-form"><label>标题<input id="feedbackTitle" placeholder="岗位失效 / 功能建议"></label><label>内容<textarea id="feedbackText" placeholder="请描述问题、期望效果或岗位链接"></textarea></label><button class="primary-button" id="sendFeedback">发送到站长邮箱</button></div>`);$('#sendFeedback').onclick=()=>{const title=$('#feedbackTitle').value.trim(),text=$('#feedbackText').value.trim();if(!title||text.length<5)return toast('请填写标题和详细内容');location.href=`mailto:tjiale49@gmail.com?subject=${encodeURIComponent(`[OfferFree] ${title}`)}&body=${encodeURIComponent(text)}`}}
  function downloadBlob(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}

  $('#heroSearch').onsubmit=event=>{event.preventDefault();activePreset='all';$$('#quickTabs button').forEach(b=>b.classList.toggle('on',b.dataset.preset==='all'));applyFilters();$('#jobs').scrollIntoView()};
  $$('#filters select').forEach(select=>select.onchange=()=>applyFilters());
  $('#clearFilters').onclick=()=>{$$('#filters select').forEach(select=>select.value=select.id==='sort'?'latest':'');$('#q').value='';activePreset='all';$$('#quickTabs button').forEach(b=>b.classList.toggle('on',b.dataset.preset==='all'));applyFilters()};
  $$('#quickTabs button').forEach(button=>button.onclick=()=>{activePreset=button.dataset.preset;$$('#quickTabs button').forEach(b=>b.classList.toggle('on',b===button));applyFilters();$('#jobs').scrollIntoView()});
  $('#loadMore').onclick=()=>{visibleCount+=24;renderJobs()};
  $('#mobileFilterButton').onclick=()=>{const on=$('#filters').classList.toggle('on');$('#mobileFilterButton').setAttribute('aria-expanded',on)};
  $('#drawerClose').onclick=closeDrawer;$('#drawerBg').onclick=event=>{if(event.target===$('#drawerBg'))closeDrawer()};
  $('#modalClose').onclick=closeModal;$('#modalBg').onclick=event=>{if(event.target===$('#modalBg'))closeModal()};
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(!$('#drawerBg').hidden)closeDrawer();if(!$('#modalBg').hidden)closeModal()}});
  $$('.workspace-tabs button').forEach(button=>button.onclick=()=>{$$('.workspace-tabs button').forEach(b=>b.classList.toggle('on',b===button));$$('.workspace-panel').forEach(panel=>panel.classList.toggle('on',panel.id===`work-${button.dataset.worktab}`))});
  $('#profileShortcut').onclick=()=>{$('#workspace').scrollIntoView();$('[data-worktab="profile"]').click()};
  $('#feedbackButton').onclick=openFeedback;
  $('#schoolSearch').onclick=()=>{const school=$('#schoolInput').value.trim();$('#schoolResult').textContent=school?`暂未找到 ${school} 可验证且经过匿名化的校友去向数据。接入该校就业质量报告后可展示行业和公司分布。`:'请先输入学校名称'};
  loadJobs();
})();
