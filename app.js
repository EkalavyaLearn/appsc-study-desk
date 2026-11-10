/* APPSC Study Desk — dependency-free browser edition. Public lesson data is unchanged. */
'use strict';
(() => {
  const STORAGE = 'appsc.study.progress.v1';
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const bridge = () => window.Android || window.APPSCBridge || null;
  const key = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(v) && !['__proto__','prototype','constructor'].includes(v);
  const safeUrl = u => { try { const x = new URL(u); return x.protocol === 'https:' && !x.username && !x.password ? x.href : ''; } catch (_) { return ''; } };
  const assetUrl = p => typeof p === 'string' && !p.includes('..') && !/[:\\]/.test(p) && !p.startsWith('/') ? p.split('/').map(encodeURIComponent).join('/') : '';
  const emptyProgress = () => ({lessons:{},bookmarks:[],last_lesson_id:null});
  let content = null, progress = emptyProgress(), storageAvailable = true, toastTimer, refreshTimer, confirmAction;
  let state = {tab:'today',studyMode:'days',lessonId:null,lessonTab:'read',questionIndex:0,search:'',post:'',subject:'',type:'',savedOnly:false};
  const typeNames = {syllabus:'Syllabus',previous_paper:'Question paper',paper_with_key:'Paper + key',solved_reference:'Solved reference',answer_key:'Answer key',circular:'Official notice',reference:'Reference',study_plan:'Study plan',lesson:'Lesson'};
  const human = s => String(s || '').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
  const ready = () => content.lessons.filter(l=>l.status==='ready');
  const lessonById = id => content.lessons.find(l=>l.id===id);
  const currentLesson = () => { const last=lessonById(progress.last_lesson_id); return last?.status==='ready'?last:ready()[0]; };
  const resourceById = id => content.resources.find(r=>r.id===id);
  const shortTitle = l => l.title.replace(/^Day\s+\d+\s*[—–:-]\s*/i,'');
  const dateLabel = d => { if(!d)return 'Not recorded'; const x=new Date(d);return isNaN(x)?String(d):x.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}); };
  const num = n => Number(n).toFixed(2).replace(/\.00$/,'').replace(/(\.\d)0$/,'$1');
  function lp(id) { return progress.lessons[id] || (progress.lessons[id]={read_sections:{},answers:{},submitted:false,attempts:[],notes:''}); }
  function stats(l) {
    const p=lp(l.id), qs=l.questions || [], answered=qs.filter(q=>Number.isInteger(p.answers[q.id])).length;
    const right=qs.filter(q=>p.answers[q.id]===q.answer_index).length, wrong=answered-right;
    const reads=(l.sections||[]).filter(s=>p.read_sections[s.id]).length;
    const steps=(l.sections||[]).length+(qs.length?1:0), done=reads+(p.submitted&&qs.length?1:0);
    return {answered,right,wrong,unanswered:qs.length-answered,score:right-wrong/3,reads,percent:steps?Math.round(done/steps*100):0,complete:steps>0&&done===steps};
  }
  function sanitizeProgress(raw) {
    if(!raw || typeof raw!=='object' || !raw.lessons || typeof raw.lessons!=='object')throw Error('Invalid progress data.');
    const out=emptyProgress();
    for(const [id,p] of Object.entries(raw.lessons).slice(0,1000)){
      if(!key(id)||!p||typeof p!=='object')continue;
      const x={read_sections:{},answers:{},submitted:p.submitted===true,attempts:[],notes:typeof p.notes==='string'?p.notes.slice(0,20000):''};
      for(const [sid,v] of Object.entries(p.read_sections||{}))if(key(sid)&&v===true)x.read_sections[sid]=true;
      for(const [qid,v] of Object.entries(p.answers||{}))if(key(qid)&&Number.isInteger(v)&&v>=0&&v<20)x.answers[qid]=v;
      x.attempts=(Array.isArray(p.attempts)?p.attempts:[]).slice(-50).filter(a=>a&&typeof a.at==='string'&&Number.isFinite(a.score)).map(a=>({at:a.at.slice(0,50),score:a.score,right:Math.max(0,Number(a.right)||0),wrong:Math.max(0,Number(a.wrong)||0),unanswered:Math.max(0,Number(a.unanswered)||0),total:Math.max(0,Number(a.total)||0)}));
      out.lessons[id]=x;
    }
    out.bookmarks=[...new Set((Array.isArray(raw.bookmarks)?raw.bookmarks:[]).filter(key))].slice(0,3000);
    out.last_lesson_id=key(raw.last_lesson_id)?raw.last_lesson_id:null;
    return out;
  }
  function save() {
    try{localStorage.setItem(STORAGE,JSON.stringify(progress));}catch(_){storageAvailable=false;toast('Browser storage is unavailable. Export progress to keep a copy.');}
  }
  try{const stored=localStorage.getItem(STORAGE);if(stored)progress=sanitizeProgress(JSON.parse(stored));}catch(_){storageAvailable=false;}
  function validContent(value) {
    const x=typeof value==='string'?JSON.parse(value):value;
    const fail=label=>{throw Error('Invalid content: '+label);};
    const object=(v,label)=>{if(!v||typeof v!=='object'||Array.isArray(v))fail(label);};
    const text=(v,label,empty=false)=>{if(typeof v!=='string'||(!empty&&!v.trim())||v.length>50000)fail(label);};
    const array=(v,label)=>{if(!Array.isArray(v)||v.length>10000)fail(label);};
    const texts=(v,label)=>{array(v,label);v.forEach(t=>text(t,label));};
    const integer=(v,label,min=0,max=100000)=>{if(!Number.isInteger(v)||v<min||v>max)fail(label);};
    const ids=(v,label)=>{array(v,label);if(v.some(t=>!key(t))||new Set(v).size!==v.length)fail(label);};
    const records=(v,label)=>{array(v,label);v.forEach(t=>{object(t,label);if(!key(t.id))fail(label+'.id');});if(new Set(v.map(t=>t.id)).size!==v.length)fail(label+'.unique_ids');};
    const refs=(v,known,label)=>{ids(v,label);if(v.some(id=>!known.has(id)))fail(label+'.reference');};
    const nullableText=(v,label)=>{if(v!=null)text(v,label);};
    const url=(v,label,nullable=false)=>{if(nullable&&v==null)return;text(v,label);if(!safeUrl(v))fail(label);};
    const isoDate=(v,label,nullable=false)=>{if(nullable&&v==null)return;text(v,label);if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)fail(label);};
    object(x,'bundle');
    if(x.schema_version!==1)fail('schema_version');
    text(x.content_version,'content_version');
    if(!/^\d+(?:[.\-]\d+)*$/.test(x.content_version))fail('content_version');
    text(x.generated_at,'generated_at');
    if(!Number.isFinite(Date.parse(x.generated_at)))fail('generated_at');
    isoDate(x.data_as_of,'data_as_of');text(x.app_title,'app_title');text(x.disclaimer,'disclaimer');
    for(const name of ['posts','subjects','resources','lessons'])records(x[name],name);
    const postIds=new Set(x.posts.map(v=>v.id)),subjectIds=new Set(x.subjects.map(v=>v.id)),resourceIds=new Set(x.resources.map(v=>v.id)),lessonIds=new Set(x.lessons.map(v=>v.id));
    for(const p of x.posts){
      for(const name of ['name','short_name','notification','scheme','date','syllabus','papers'])text(p[name],'post.'+name);
      refs(p.subject_ids,subjectIds,'post.subject_ids');url(p.source_url,'post.source_url');isoDate(p.exam_date,'post.exam_date',true);
      if(p.observation!=null)text(p.observation,'post.observation',true);
    }
    for(const sub of x.subjects){text(sub.name,'subject.name');refs(sub.post_ids,postIds,'subject.post_ids');}
    const contentTypes=new Set(Object.keys(typeNames));
    for(const r of x.resources){
      text(r.title,'resource.title');refs(r.post_ids,postIds,'resource.post_ids');refs(r.subject_ids,subjectIds,'resource.subject_ids');
      if(!contentTypes.has(r.content_type))fail('resource.content_type');
      text(r.key_status,'resource.key_status');text(r.practice_mode,'resource.practice_mode');texts(r.limitations,'resource.limitations');refs(r.paired_resource_ids,resourceIds,'resource.paired_resource_ids');
      if(!['official','local_authored'].includes(r.source_type))fail('resource.source_type');
      nullableText(r.stage,'resource.stage');nullableText(r.notification,'resource.notification');
      if(r.pages!=null)integer(r.pages,'resource.pages',1);
      if(r.exam_year!=null)integer(r.exam_year,'resource.exam_year',1900,2200);
      url(r.source_url,'resource.source_url',true);url(r.official_url,'resource.official_url',true);
      if(r.asset_path!=null){text(r.asset_path,'resource.asset_path');if(!assetUrl(r.asset_path))fail('resource.asset_path');}
      if(r.content_type==='lesson'&&(!key(r.lesson_id)||!lessonIds.has(r.lesson_id)))fail('resource.lesson_id');
    }
    for(const l of x.lessons){
      text(l.title,'lesson.title');integer(l.day_number,'lesson.day_number',1);integer(l.duration_minutes,'lesson.duration_minutes',1,1440);
      if(!['ready','planned'].includes(l.status))fail('lesson.status');
      if(l.status==='planned')continue;
      text(l.intro,'lesson.intro');isoDate(l.prepared_date,'lesson.prepared_date');refs(l.post_ids,postIds,'lesson.post_ids');refs(l.subject_ids,subjectIds,'lesson.subject_ids');
      records(l.schedule,'lesson.schedule');records(l.sections,'lesson.sections');records(l.questions,'lesson.questions');records(l.sources,'lesson.sources');texts(l.review,'lesson.review');
      const sectionIds=new Set(l.sections.map(s=>s.id)),sourceIds=new Set(l.sources.map(s=>s.id));
      for(const source of l.sources){text(source.title,'source.title');url(source.url,'source.url');}
      for(const row of l.schedule){text(row.title,'schedule.title');integer(row.minutes,'schedule.minutes',1,1440);if(row.section_id!=null&&(!key(row.section_id)||!sectionIds.has(row.section_id)))fail('schedule.section_id');}
      for(const section of l.sections){text(section.title,'section.title');integer(section.minutes,'section.minutes',1,1440);texts(section.paragraphs,'section.paragraphs');refs(section.source_ids,sourceIds,'section.source_ids');}
      for(const q of l.questions){
        for(const name of ['topic','prompt','explanation'])text(q[name],'question.'+name);
        if(!key(q.subject_id)||!subjectIds.has(q.subject_id))fail('question.subject_id');
        texts(q.options,'question.options');if(q.options.length<2||q.options.length>6||new Set(q.options).size!==q.options.length)fail('question.options');
        integer(q.answer_index,'question.answer_index',0,q.options.length-1);
      }
    }
    object(x.plan,'plan');integer(x.plan.daily_minutes,'plan.daily_minutes',1,1440);array(x.plan.daily,'plan.daily');x.plan.daily.forEach(row=>texts(row,'plan.daily.row'));
    array(x.plan.weeks,'plan.weeks');
    for(const week of x.plan.weeks){object(week,'week');integer(week.number,'week.number',1);for(const name of ['dates','title','description'])text(week[name],'week.'+name);if(week.status!=='planned')fail('week.status');}
    texts(x.plan.practice_method,'plan.practice_method');texts(x.plan.weekly_review,'plan.weekly_review');
    if(x.updates!=null){array(x.updates,'updates');for(const u of x.updates){object(u,'update');isoDate(u.published,'update.published');url(u.url,'update.url');text(u.effect,'update.effect');}}
    return x;
  }
  function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('visible'),3500);}
  function setContent(value,announce=false){
    const candidate=validContent(value);
    const previous={content,state:{...state},progress:JSON.parse(JSON.stringify(progress)),html:$('#app').innerHTML};
    try{
      content=candidate;
      if(state.lessonId&&lessonById(state.lessonId)?.status!=='ready')state.lessonId=null;
      render();
    }catch(error){
      content=previous.content;state=previous.state;progress=previous.progress;
      if($('#app').innerHTML!==previous.html)$('#app').innerHTML=previous.html;
      throw error;
    }
    clearTimeout(refreshTimer);
    if(announce)toast('Study content updated. Your progress is kept.');
  }
  const button=(text,action,extra='',cls='')=>`<button class="btn ${cls}" data-action="${action}" ${extra}>${text}</button>`;
  const link=(title,url)=>safeUrl(url)?`<a class="source-link" href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${icon('external')}${esc(title)}</a>`:'';
  const pills=(arr)=>arr.map(x=>`<span class="pill">${esc(x)}</span>`).join('');
  const bar=(pct)=>`<progress class="progress-track" max="100" value="${pct}" aria-label="Lesson progress: ${pct}%">${pct}%</progress>`;
  function render(){
    if(!content)return;
    const nav=[['today','sun','Today'],['study','book','Study'],['library','folder','Library'],['progress','chart','Progress']];
    let page=state.tab==='today'?today():state.tab==='study'?study():state.tab==='library'?library():progressPage();
    $('#app').innerHTML=`<header class="app-header"><div class="brand"><div class="brand-mark">${icon('book')}</div><div><div class="brand-name">APPSC Study Desk</div><div class="brand-note">A little progress, every day.</div></div></div><button class="icon-btn" data-action="about" aria-label="About, privacy and content updates">${icon('info')}</button></header><main class="main" id="main-content">${page}</main><nav class="bottom-nav" aria-label="Main navigation">${nav.map(([id,i,label])=>`<button class="nav-item ${state.tab===id?'active':''}" data-action="nav" data-tab="${id}" ${state.tab===id?'aria-current="page"':''}>${icon(i)}<span>${label}</span></button>`).join('')}</nav>`;
  }
  function intro(title,text){return `<div class="page-intro"><h1>${title}</h1>${text?`<p>${text}</p>`:''}</div>`;}
  function today(){
    const l=currentLesson();if(!l)return `${intro('Your study space','New lessons will appear here when ready.')}<div class="empty">${icon('book')}<h3>No prepared lesson yet</h3><p>The library and syllabus remain available.</p></div>`;
    const s=stats(l), done=ready().filter(x=>stats(x).complete).length, milestone=content.posts.find(p=>p.id==='group_i');
    return `<section class="hero"><div class="hero-top"><span class="eyebrow">Your daily study space</span><span class="pill dark">${icon('clock')}2 hours</span></div><h1>Make two hours<br>count.</h1><p class="hero-text">One focused lesson. A few good questions.<br>A clearer path through the syllabus.</p>${button(`${s.complete?'Revisit':s.percent?'Continue':'Start'} Day ${l.day_number} ${icon('arrow')}`,'open-lesson',`data-id="${esc(l.id)}"`,'cream')}</section>
      <div class="mini-stats"><div class="mini-stat"><strong>${done}<span class="sr-only"> completed</span> / ${ready().length}</strong><span>Prepared lessons completed</span></div><div class="mini-stat"><strong>${s.answered} / ${l.questions.length}</strong><span>Day ${l.day_number} questions answered</span></div></div>
      <div class="heading-row"><h2>On your desk</h2><span class="pill ready">Prepared content</span></div>
      <section class="card"><div class="eyebrow muted">Day ${l.day_number} · ${l.duration_minutes} minutes</div><h2 class="section-space">${esc(shortTitle(l))}</h2>${bar(s.percent)}<div class="progress-caption"><span>${s.reads}/${l.sections.length} reading blocks checked</span><span>${s.percent}%</span></div><div class="timeline">${l.schedule.map((x,i)=>`<div class="timeline-item"><div class="step-number ${x.section_id&&lp(l.id).read_sections[x.section_id]?'done':''}">${x.section_id&&lp(l.id).read_sections[x.section_id]?icon('check'):String(i+1).padStart(2,'0')}</div><div class="timeline-title">${esc(x.title)}</div><div class="time-label">${x.minutes} min</div></div>`).join('')}</div></section>
      <div class="heading-row"><h2>Next milestone</h2><button class="text-btn" data-action="post" data-id="group_i">View scheme ${icon('arrow')}</button></div><section class="card"><div class="row"><div><span class="eyebrow muted">Group I screening</span><h3 class="section-space">${esc(milestone?.exam_date?dateLabel(milestone.exam_date):'Date not announced')}</h3></div><div class="brand-mark">${icon('leaf')}</div></div><p class="muted section-space">${esc(milestone?.date||'Consult the current official notification for the examination date.')}</p></section>
      <div class="notice">${icon('info')}<p>Internet is needed to open or reload this website and its source links. Progress is saved in this browser. Content checked ${esc(dateLabel(content.data_as_of))}.</p></div><p class="footer-note">Independent study aid · Not an official APPSC website</p>`;
  }
  function study(){
    if(state.lessonId)return lessonPage(lessonById(state.lessonId));
    let body='';
    if(state.studyMode==='days')body=`<div class="section-stack">${content.lessons.map(l=>lessonCard(l)).join('')}</div><div class="heading-row"><h2>The weeks ahead</h2><span class="pill">Outline only</span></div><p class="small muted">A preparation route, not finished lesson content. Ready lessons appear above.</p>${(content.plan.weeks||[]).map(w=>`<details class="outline-row"><summary><span class="week">${String(w.number).padStart(2,'0')}</span><div><h3>${esc(w.title)}</h3><span class="small muted">${esc(w.dates)}</span></div><span class="pill">Planned</span></summary><p>${esc(w.description)}</p></details>`).join('')}`;
    if(state.studyMode==='subjects')body=`<div class="subject-grid">${content.subjects.map(s=>{const l=ready().filter(l=>l.subject_ids.includes(s.id)),n=content.resources.filter(r=>r.subject_ids.includes(s.id)).length;return `<button class="subject-card" data-action="subject" data-id="${esc(s.id)}"><div><span class="subject-icon">${icon(s.id==='aptitude'||s.id==='statistics'?'chart':'book')}</span><h3>${esc(s.name)}</h3></div><p>${l.length?`${l.length} introductory lesson`:'Lessons not prepared'} · ${n} resources</p></button>`;}).join('')}</div>`;
    if(state.studyMode==='posts')body=`<div class="section-stack">${content.posts.map(p=>`<section class="card"><div class="post-head"><span class="eyebrow muted">${esc(p.short_name)}</span><span class="post-code">${esc(p.notification)}</span></div><h3 class="section-space">${esc(p.name)}</h3><p class="muted section-space">${esc(p.scheme)}</p><div class="btn-row">${button('Study guide','post',`data-id="${esc(p.id)}"`,'secondary')}${button('Resources','filter-post',`data-id="${esc(p.id)}"`)}</div></section>`).join('')}</div>`;
    return `${intro('Build your foundation','Choose a day, a subject or a post.')}<div class="chips" aria-label="Study categories">${[['days','By day'],['subjects','By subject'],['posts','By post']].map(([id,label])=>`<button class="chip ${state.studyMode===id?'active':''}" data-action="study-mode" data-mode="${id}" aria-pressed="${state.studyMode===id}">${label}</button>`).join('')}</div><div class="section-space">${body}</div>`;
  }
  function lessonCard(l){
    if(l.status!=='ready')return `<section class="card"><span class="pill">Not prepared</span><h3 class="section-space">${esc(l.title)}</h3><p class="muted section-space">This is a planned lesson. Study content is not available yet.</p></section>`;
    const s=stats(l);
    return `<button class="card lesson-card" data-action="open-lesson" data-id="${esc(l.id)}"><div class="row"><span class="pill ready">${s.complete?'Completed':'Ready to study'}</span><span class="small muted">Day ${l.day_number}</span></div><div class="eyebrow">A focused foundation session</div><h3>${esc(shortTitle(l))}</h3><div class="meta-line">${icon('clock')} ${l.duration_minutes} minutes <span>·</span> ${l.questions.length} original questions</div>${bar(s.percent)}<div class="progress-caption"><span>${s.percent?s.percent+'% complete':'Your progress stays in this browser'}</span>${icon('arrow')}</div></button>`;
  }
  function lessonPage(l){
    if(!l||l.status!=='ready'){state.lessonId=null;return study();}
    const s=stats(l);
    return `<div class="back-row"><button class="back-button" data-action="lesson-back">${icon('back')}All lessons</button><span class="pill">${l.duration_minutes} min</span></div><div class="lesson-heading"><span class="eyebrow muted">Day ${l.day_number} · Prepared ${esc(dateLabel(l.prepared_date))}</span><h1>${esc(shortTitle(l))}</h1><p>${esc(l.intro)}</p>${bar(s.percent)}<div class="progress-caption"><span>${s.reads}/${l.sections.length} reading blocks · ${lp(l.id).submitted?'quiz checked':'quiz not checked'}</span><span>${s.percent}%</span></div></div><div class="chips lesson-tabs" aria-label="Lesson sections">${[['read','Read & recall'],['quiz',`Practice (${l.questions.length})`],['review','Review']].map(([id,t])=>`<button class="chip ${state.lessonTab===id?'active':''}" data-action="lesson-tab" data-mode="${id}" aria-pressed="${state.lessonTab===id}">${t}</button>`).join('')}</div><div class="section-space">${state.lessonTab==='read'?reading(l):state.lessonTab==='quiz'?quiz(l):review(l)}</div>`;
  }
  function reading(l){
    return `<div class="section-stack">${l.sections.map((s,i)=>`<details class="card reading-card" ${i===0?'open':''}><summary><span class="step-number ${lp(l.id).read_sections[s.id]?'done':''}">${lp(l.id).read_sections[s.id]?icon('check'):String(i+1).padStart(2,'0')}</span><div class="reading-title"><h3>${esc(s.title)}</h3><span class="small">${s.minutes} minute reading and recall block</span></div></summary><div class="reading-body">${s.paragraphs.map(p=>`<p>${esc(p)}</p>`).join('')}<div class="source-list">${(s.source_ids||[]).map(id=>l.sources.find(x=>x.id===id)).filter(Boolean).map(x=>link(x.title,x.url)).join('')}</div><button class="done-btn ${lp(l.id).read_sections[s.id]?'checked':''}" data-action="read-section" data-id="${esc(s.id)}" aria-pressed="${!!lp(l.id).read_sections[s.id]}">${icon('check')}${lp(l.id).read_sections[s.id]?'Reading & recall checked':'Mark reading & recall done'}</button></div></details>`).join('')}</div><div class="notice">${icon('info')}<p>Read, cover the notes, then explain the idea from memory. Check each block when you have finished it. This records completion, not time spent.</p></div><div class="btn-row">${button(`Try the questions ${icon('arrow')}`,'lesson-tab','data-mode="quiz"')}</div>`;
  }
  function quiz(l){
    const p=lp(l.id),s=stats(l);if(!l.questions.length)return '<div class="empty">No questions are prepared for this lesson yet.</div>';
    state.questionIndex=Math.max(0,Math.min(state.questionIndex,l.questions.length-1));
    const q=l.questions[state.questionIndex],answer=p.answers[q.id];
    return `${p.submitted?scoreSummary(l):`<div class="notice warm">${icon('info')}<p>Answer without notes, then check the whole set. These are original learning questions, not an official APPSC mock.</p></div>`}<div class="card section-space"><div class="question-top"><strong>Question ${state.questionIndex+1} <span class="muted">of ${l.questions.length}</span></strong><span class="pill">${esc(q.topic)}</span></div><div class="question-title">${esc(q.prompt)}</div><div role="group" aria-label="Answer choices">${q.options.map((o,i)=>`<button class="option ${answer===i?'selected':''} ${p.submitted?(i===q.answer_index?'correct':answer===i?'wrong':''):''}" data-action="answer" data-index="${i}" aria-pressed="${answer===i}" ${p.submitted?'disabled':''}><span class="option-letter">${String.fromCharCode(65+i)}</span><span>${esc(o)}</span>${p.submitted&&i===q.answer_index?icon('check'):''}</button>`).join('')}</div>${!p.submitted&&answer!==undefined?'<button class="text-btn" data-action="clear-one">Clear this answer</button>':''}${p.submitted?`<div class="answer-note"><strong>${answer===undefined?'Unanswered':answer===q.answer_index?'Correct':'Review this idea'} · Answer ${String.fromCharCode(65+q.answer_index)}</strong>${esc(q.explanation)}</div>`:''}<div class="btn-row">${button(`${icon('back')}Previous`,'question-prev',state.questionIndex===0?'disabled':'','secondary')}${button(`Next ${icon('arrow')}`,'question-next',state.questionIndex===l.questions.length-1?'disabled':'')}</div><div class="question-dots" aria-label="Question navigation">${l.questions.map((x,i)=>`<button class="question-dot ${i===state.questionIndex?'current':''} ${p.answers[x.id]!==undefined?'answered':''} ${p.submitted?(p.answers[x.id]===x.answer_index?'right':p.answers[x.id]!==undefined?'incorrect':''):''}" data-action="question-go" data-index="${i}" aria-label="Question ${i+1}${p.answers[x.id]!==undefined?', answered':', unanswered'}" ${i===state.questionIndex?'aria-current="step"':''}>${i+1}</button>`).join('')}</div><div class="progress-caption section-space"><span>${s.answered} answered · ${s.unanswered} unanswered</span></div></div><div class="btn-row">${p.submitted?button('Clear answers & retry','clear-answers','','secondary')+button('Review & notes','lesson-tab','data-mode="review"'):button('Clear all answers','clear-answers','','secondary')+button('Check answers','submit-quiz',s.answered?'':'disabled')}</div>`;
  }
  function scoreSummary(l){const s=stats(l);return `<section class="score-hero"><div class="eyebrow muted">Your practice score</div><div class="score-number">${num(s.score)} <small>/ ${l.questions.length}</small></div><div class="score-stats"><div><strong>${s.right}</strong>Correct</div><div><strong>${s.wrong}</strong>Wrong</div><div><strong>${s.unanswered}</strong>Unanswered</div></div><p class="small muted section-space">Correct − wrong ÷ 3. A foundation check, not a selection prediction.</p></section>`;}
  function review(l){const p=lp(l.id);return `${p.submitted?scoreSummary(l):'<div class="notice">'+icon('info')+'<p>Check your quiz answers first to see a score and explanations.</p></div>'}<section class="card section-space"><h2>Turn mistakes into notes</h2><label class="field-label" for="lesson-notes">What will you do differently next time?</label><textarea id="lesson-notes" data-lesson="${esc(l.id)}" maxlength="20000" placeholder="Example: I confused adoption with commencement. Review this in 2 days.">${esc(p.notes)}</textarea><p class="notes-hint">Saved in this browser. Do not enter personal or application details.</p><div class="divider"></div>${l.review.map(t=>`<p>${esc(t)}</p>`).join('')}</section><section class="card section-space"><h3>Your attempts</h3>${p.attempts.length?p.attempts.slice().reverse().slice(0,5).map(a=>`<div class="history-row"><span>${esc(dateLabel(a.at))}</span><strong>${num(a.score)} / ${a.total}</strong></div>`).join(''):'<p class="muted section-space">No checked attempt yet. Your first score will appear here.</p>'}</section><div class="btn-row">${button('Back to reading','lesson-tab','data-mode="read"','secondary')}${button('Practice questions','lesson-tab','data-mode="quiz"')}</div>`;}
  function library(){
    const found=filteredResources();
    return `${intro('Your reference shelf','Official syllabuses, past papers and carefully labelled keys.')}<label class="search-box">${icon('search')}<span class="sr-only">Search resources</span><input id="resource-search" type="search" placeholder="Search papers, topics, years…" value="${esc(state.search)}" autocomplete="off"></label><div class="filters"><label><span class="filter-label">Post</span><select id="filter-post"><option value="">All posts</option>${content.posts.map(p=>`<option value="${esc(p.id)}" ${state.post===p.id?'selected':''}>${esc(p.short_name)}</option>`).join('')}</select></label><label><span class="filter-label">Subject</span><select id="filter-subject"><option value="">All subjects</option>${content.subjects.map(s=>`<option value="${esc(s.id)}" ${state.subject===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><label><span class="filter-label">Content</span><select id="filter-type"><option value="">All types</option>${Object.entries(typeNames).map(([id,label])=>`<option value="${id}" ${state.type===id?'selected':''}>${label}</option>`).join('')}</select></label><label><span class="filter-label">Collection</span><select id="filter-saved"><option value="all">All resources</option><option value="saved" ${state.savedOnly?'selected':''}>Saved resources</option></select></label></div><div class="library-meta"><span id="resource-count">${found.length} resources</span><button class="text-btn" data-action="reset-filters">Reset filters</button></div><div id="resource-list" class="section-stack resource-stack">${resourceCards(found)}</div>`;
  }
  function filteredResources(){const query=state.search.toLowerCase().trim();return content.resources.filter(r=>(!state.post||r.post_ids.includes(state.post))&&(!state.subject||r.subject_ids.includes(state.subject))&&(!state.type||r.content_type===state.type)&&(!state.savedOnly||progress.bookmarks.includes(r.id))&&(!query||[r.title,r.exam_year,r.notification,r.stage,...r.subject_ids.map(id=>content.subjects.find(x=>x.id===id)?.name||id)].join(' ').toLowerCase().includes(query)));}
  function resourceCards(items){return items.length?items.map(r=>`<section class="card resource-card"><div class="resource-top"><button class="resource-open" data-action="resource" data-id="${esc(r.id)}"><div class="resource-tags"><span class="pill">${esc(typeNames[r.content_type]||human(r.content_type))}</span>${r.key_status==='final'?'<span class="pill ready">Final key</span>':r.key_status==='initial'?'<span class="pill warm">Initial key</span>':''}</div><h3>${esc(r.title)}</h3></button><button class="bookmark ${progress.bookmarks.includes(r.id)?'on':''}" data-action="bookmark" data-id="${esc(r.id)}" aria-label="${progress.bookmarks.includes(r.id)?'Unsave':'Save'} ${esc(r.title)}" aria-pressed="${progress.bookmarks.includes(r.id)}">${icon('star')}</button></div>${r.practice_mode==='solved_reference_only'?'<div class="resource-warning">Missing full options · reference practice only</div>':''}<div class="resource-foot"><span>${r.exam_year?`${r.exam_year} · `:''}${r.pages?`${r.pages} pages`:r.source_type==='official'?'Official source':'Prepared material'}</span><span>${r.asset_path||['lesson','study_plan'].includes(r.content_type)?'Prepared content':'External source'}</span></div></section>`).join(''):`<div class="empty">${icon('search')}<h3>No matching resources</h3><p>Try a different subject or clear a filter.</p></div>`;}
  function progressPage(){
    const lessons=ready(),finished=lessons.filter(l=>stats(l).complete).length,answered=lessons.reduce((n,l)=>n+stats(l).answered,0),reads=lessons.reduce((n,l)=>n+stats(l).reads,0);
    return `${intro('See what is growing','Small, honest records of your work. Stored in this browser.')}<div class="metric-grid"><div class="metric"><strong>${finished}</strong><span>Lessons completed</span></div><div class="metric"><strong>${reads}</strong><span>Blocks checked</span></div><div class="metric"><strong>${answered}</strong><span>Answers saved</span></div></div><div class="heading-row"><h2>Lesson progress</h2><span class="small muted">${lessons.length} ready</span></div>${lessons.map(l=>{const s=stats(l),p=lp(l.id),best=p.attempts.length?Math.max(...p.attempts.map(a=>a.score)):null;return `<section class="card"><div class="row"><h3>Day ${l.day_number}</h3><span class="pill ${s.complete?'ready':''}">${s.complete?'Completed':s.percent?'In progress':'Not started'}</span></div><p class="muted section-space">${esc(shortTitle(l))}</p>${bar(s.percent)}<div class="progress-caption"><span>${s.reads}/${l.sections.length} blocks · ${s.answered}/${l.questions.length} answers</span><span>${s.percent}%</span></div><div class="progress-list"><span>Best checked practice score</span><strong>${best===null?'—':num(best)+' / '+l.questions.length}</strong></div>${button('Open lesson','open-lesson',`data-id="${esc(l.id)}"`,'secondary full')}</section>`;}).join('')}<section class="card section-space"><div class="row"><h3>Saved references</h3><span class="pill">${progress.bookmarks.length}</span></div><p class="muted section-space">Bookmarks keep useful sources easy to find. They do not download the linked PDFs.</p><button class="text-btn" data-action="show-saved">Open saved resources ${icon('arrow')}</button></section><section class="card section-space"><h3>Keep a copy of your work</h3><p class="muted section-space">Export progress to a JSON file or restore a saved copy. Import replaces this device's progress after confirmation.</p><div class="btn-row">${button(`${icon('download')}Export`,'export-progress')}${button('Import','import-progress','','secondary')}</div>${!storageAvailable?'<div class="notice warm">Device storage could not be used. Export before closing the app.</div>':''}</section><div class="notice">${icon('info')}<p>Completion reflects the blocks you check and a submitted practice set. It is not a measure of mastery or an official exam result.</p></div><button class="text-btn danger-link section-space" data-action="reset-progress">Reset all local progress</button>`;
  }
  function modal(title,body,centered=false){
    const previousFocus=document.activeElement;
    $('#modal-root').innerHTML=`<div class="modal-backdrop ${centered?'centered':''}"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1"><div class="modal-head"><h2 id="dialog-title">${esc(title)}</h2><button class="icon-btn modal-close" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button></div>${body}</section></div>`;
    $('#modal-root')._previousFocus=previousFocus;document.body.style.overflow='hidden';$('.modal').focus();
  }
  function closeModal(){const old=$('#modal-root')._previousFocus;$('#modal-root').innerHTML='';document.body.style.overflow='';confirmAction=null;if(old&&old.isConnected)old.focus();}
  function confirm(title,text,action,label='Continue',danger=false){confirmAction=action;modal(title,`<p class="muted">${esc(text)}</p><div class="btn-row">${button('Cancel','close-modal','','secondary')}${button(esc(label),'confirm','',danger?'danger':'')}</div>`,true);}
  function resourceModal(r){
    if(!r)return;
    const related=r.paired_resource_ids.map(resourceById).filter(Boolean);
    const local=assetUrl(r.asset_path),url=safeUrl(r.source_url||r.official_url);
    modal(r.title,`<div class="resource-tags">${pills([typeNames[r.content_type]||human(r.content_type),r.source_type==='official'?'Official source':'Prepared material'])}</div><div class="meta-line">${r.exam_year?'Exam year '+esc(r.exam_year)+' · ':''}${r.notification?'Notification '+esc(r.notification):''}${r.pages?' · '+r.pages+' pages':''}</div>${r.stage?`<p class="small muted">Stage: ${esc(human(r.stage))}</p>`:''}${r.key_status==='initial'?'<div class="notice warm">Initial key: use the paired final key for historical scoring.</div>':''}${r.limitations.length?`<div class="modal-section section-space"><h3>Before you use this file</h3><ul>${r.limitations.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div>`:''}<div class="btn-row">${r.content_type==='lesson'?button('Open lesson','open-lesson',`data-id="${esc(r.lesson_id||'day-01')}"`):r.content_type==='study_plan'?button('View study outline','show-plan'):local?`<a class="btn" href="${esc(local)}">${icon('file')}Open study file</a>`:''}${url?`<a class="btn ${local?'secondary':''}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Official source ${icon('external')}</a>`:''}</div>${url?'<p class="notes-hint">Opens the official website in a new tab. Internet is required.</p>':''}${related.length?`<div class="modal-section section-space"><h3>Matching paper and key</h3>${related.map(x=>`<button class="text-btn" data-action="resource" data-id="${esc(x.id)}">${esc(x.title)} ${icon('arrow')}</button>`).join('')}</div>`:''}`);
  }
  function subjectModal(id){const s=content.subjects.find(x=>x.id===id);if(!s)return;const ls=ready().filter(l=>l.subject_ids.includes(id));modal(s.name,`<p class="muted">${ls.length?'An introductory lesson is ready. The complete subject module is not yet prepared.':'This subject is on the syllabus map. A complete lesson module is not prepared yet.'}</p>${ls.map(l=>`<div class="btn-row">${button('Open Day '+l.day_number,'open-lesson',`data-id="${esc(l.id)}"`)}</div>`).join('')}<div class="btn-row">${button('Browse subject resources','filter-subject',`data-id="${esc(id)}"`,'secondary')}</div>`);}
  function postModal(id){const p=content.posts.find(x=>x.id===id);if(!p)return;modal(p.name,`<span class="pill">Notification ${esc(p.notification)}</span><div class="modal-section section-space"><h3>Scheme</h3><p>${esc(p.scheme)}</p></div><div class="modal-section"><h3>Examination date</h3><p>${esc(p.date)}</p><p class="notes-hint">Status from content checked ${esc(dateLabel(content.data_as_of))}. Consult current official notices.</p></div><div class="modal-section"><h3>What to study</h3><p>${esc(p.syllabus)}</p></div><div class="modal-section"><h3>Past-paper collection</h3><p>${esc(p.papers)}</p></div>${link('Read the official notification',p.source_url)}<div class="btn-row">${button('Browse resources','filter-post',`data-id="${esc(id)}"`)}</div>`);}
  function about(){modal('An independent study desk',`<p>${esc(content.disclaimer)}</p><div class="notice">${icon('leaf')}<p>Free to use. No advertising. Your progress and notes stay in this browser. Internet is needed to open or reload lessons.</p></div><div class="modal-section section-space"><h3>Content & updates</h3><p>Sources checked ${esc(dateLabel(content.data_as_of))}. Bundle ${esc(content.content_version)}.</p><p>Refreshing downloads a public study-content bundle. It does not submit applications or verify eligibility.</p><div class="btn-row">${button(`${icon('refresh')}Check for content updates`,'refresh','','secondary')}</div></div><div class="modal-section"><h3>Privacy & support</h3><p>Progress and notes are stored in this browser. Export a copy before clearing site data, changing browsers or moving to a new website address.</p><a class="source-link" href="about.html">${icon('info')}About this website</a><a class="source-link" href="privacy.html">${icon('info')}Read the privacy policy</a><a class="source-link" href="mailto:nalamalan@gmail.com">${icon('external')}Contact support</a></div><div class="modal-section"><h3>Official sources</h3>${content.posts.map(p=>link(p.short_name+' · '+p.notification,p.source_url)).join('')}</div><p class="small muted">Historical papers retain their original dates and answer-key limitations. Future study outlines are labelled as planned; only prepared lessons can be opened.</p>`);}
  function navigate(tab){state.tab=tab;if(tab!=='study')state.lessonId=null;closeModal();render();window.scrollTo(0,0);}
  function openLesson(id){const l=lessonById(id);if(!l||l.status!=='ready'){toast('This lesson is not prepared yet.');return;}progress.last_lesson_id=id;save();state.tab='study';state.lessonId=id;state.lessonTab='read';state.questionIndex=0;closeModal();render();window.scrollTo(0,0);}
  function exportProgress(){const payload=JSON.stringify({type:'appsc-study-progress',schema_version:1,content_version:content.content_version,exported_at:new Date().toISOString(),data:progress},null,2);try{if(bridge()?.exportProgress){bridge().exportProgress(payload);return;}const blob=new Blob([payload],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='appsc-study-progress-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Progress export prepared.');}catch(_){toast('Could not export progress. Please try again.');}}
  function receiveProgress(value){try{const x=typeof value==='string'?JSON.parse(value):value;if(x.type!=='appsc-study-progress'||x.schema_version!==1)throw Error('Unsupported progress file.');const imported=sanitizeProgress(x.data);confirm('Restore saved progress?','This replaces the answers, notes, reading checks and bookmarks currently saved in this browser. Export your current progress first if you need to keep it.',()=>{progress=imported;save();render();toast('Saved progress restored.');},'Restore');}catch(_){toast('That file is not a valid Study Desk progress export.');}}
  async function refresh(){closeModal();toast('Checking for study-content updates…');try{if(bridge()?.refreshContent){bridge().refreshContent();clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>toast('The update is taking longer. Existing lessons are still available.'),20000);return;}const response=await fetch('content.json',{cache:'no-store'});if(!response.ok)throw Error();setContent(await response.json(),true);}catch(_){toast('Update unavailable. You can continue with the lessons already open in this tab.');}}
  document.addEventListener('click',e=>{
    const el=e.target.closest('[data-action]');if(!el)return;const a=el.dataset.action,id=el.dataset.id;
    if(a==='confirm'){const f=confirmAction;closeModal();f?.();return;}
    if(a==='close-modal'){closeModal();return;}
    if(a==='nav'){navigate(el.dataset.tab);return;}
    if(a==='about'){about();return;}
    if(a==='refresh'){refresh();return;}
    if(a==='open-lesson'){openLesson(id);return;}
    if(a==='study-mode'){state.studyMode=el.dataset.mode;render();return;}
    if(a==='lesson-back'){state.lessonId=null;render();window.scrollTo(0,0);return;}
    if(a==='subject'){subjectModal(id);return;}
    if(a==='post'){postModal(id);return;}
    if(a==='resource'){resourceModal(resourceById(id));return;}
    if(a==='show-plan'){state.studyMode='days';navigate('study');state.lessonId=null;render();return;}
    if(a==='filter-post'||a==='filter-subject'){state.post=a==='filter-post'?id:'';state.subject=a==='filter-subject'?id:'';state.search='';state.type='';state.savedOnly=false;navigate('library');return;}
    if(a==='show-saved'){state.post=state.subject=state.search=state.type='';state.savedOnly=true;navigate('library');return;}
    if(a==='reset-filters'){state.post=state.subject=state.search=state.type='';state.savedOnly=false;render();return;}
    if(a==='bookmark'){const i=progress.bookmarks.indexOf(id);if(i<0)progress.bookmarks.push(id);else progress.bookmarks.splice(i,1);save();render();toast(i<0?'Saved to your references.':'Removed from saved references.');return;}
    if(a==='export-progress'){exportProgress();return;}
    if(a==='import-progress'){if(bridge()?.importProgress)bridge().importProgress();else $('#import-file').click();return;}
    if(a==='reset-progress'){confirm('Reset local progress?','This clears every answer, reading check, attempt, note and bookmark in this browser. Study content is unchanged. Export a backup first if needed.',()=>{progress=emptyProgress();save();render();toast('Local progress reset.');},'Reset',true);return;}
    const l=lessonById(state.lessonId);if(!l)return;const p=lp(l.id);
    if(a==='lesson-tab'){state.lessonTab=el.dataset.mode;render();return;}
    if(a==='read-section'){const details=el.closest('details');p.read_sections[id]=!p.read_sections[id];save();const opened=[...document.querySelectorAll('.reading-card[open]')].map(x=>[...x.parentNode.children].indexOf(x));render();document.querySelectorAll('.reading-card').forEach((x,i)=>x.open=opened.includes(i));toast(p.read_sections[id]?'Reading and recall checked.':'Reading check removed.');return;}
    if(a==='answer'&&!p.submitted){p.answers[l.questions[state.questionIndex].id]=Number(el.dataset.index);save();render();return;}
    if(a==='clear-one'&&!p.submitted){delete p.answers[l.questions[state.questionIndex].id];save();render();return;}
    if(a==='question-prev'||a==='question-next'||a==='question-go'){state.questionIndex=a==='question-go'?Number(el.dataset.index):state.questionIndex+(a==='question-prev'?-1:1);render();return;}
    if(a==='clear-answers'){confirm('Clear this answer set?','Current selections and displayed explanations will be cleared. Reading checks, notes and previous attempt records will remain.',()=>{p.answers={};p.submitted=false;state.questionIndex=0;save();render();toast('Answers cleared. Ready for another attempt.');},'Clear answers');return;}
    if(a==='submit-quiz'&&!p.submitted){const st=stats(l);if(!st.answered)return;const submit=()=>{p.submitted=true;p.attempts.push({at:new Date().toISOString(),score:st.score,right:st.right,wrong:st.wrong,unanswered:st.unanswered,total:l.questions.length});p.attempts=p.attempts.slice(-50);save();render();toast('Answers checked. Review each explanation.');};if(st.unanswered)confirm('Check this attempt?',`${st.unanswered} question${st.unanswered===1?' is':'s are'} unanswered and will score zero. You can review explanations after checking.`,submit,'Check answers');else submit();return;}
  });
  document.addEventListener('input',e=>{
    if(e.target.id==='resource-search'){state.search=e.target.value;const rs=filteredResources();$('#resource-list').innerHTML=resourceCards(rs);$('#resource-count').textContent=rs.length+' resources';}
    if(e.target.id==='lesson-notes'){lp(e.target.dataset.lesson).notes=e.target.value;save();}
  });
  document.addEventListener('change',e=>{
    const map={'filter-post':'post','filter-subject':'subject','filter-type':'type'};
    if(map[e.target.id]){state[map[e.target.id]]=e.target.value;render();}
    if(e.target.id==='filter-saved'){state.savedOnly=e.target.value==='saved';render();}
    if(e.target.id==='import-file'){const f=e.target.files[0];if(!f)return;if(f.size>5000000){toast('This progress file is too large.');return;}f.text().then(receiveProgress).catch(()=>toast('Could not read that file.'));e.target.value='';}
  });
  document.addEventListener('keydown',e=>{const m=$('.modal');if(!m)return;if(e.key==='Escape'){closeModal();return;}if(e.key==='Tab'){const items=[...m.querySelectorAll('button,a,input,select,textarea,[tabindex="0"]')].filter(x=>!x.disabled),first=items[0],last=items.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===m)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
  window.appContentUpdated=value=>{try{setContent(value,true);}catch(_){toast('Update format not supported. Current lessons are kept.');}};
  window.appContentUpdateFailed=message=>{clearTimeout(refreshTimer);toast('Could not update content. You can continue with the lessons already open in this tab.');};
  window.appProgressImported=receiveProgress;
  window.appProgressExported=()=>toast('Progress exported.');
  window.appProgressExportFailed=()=>toast('Progress export was not completed.');
  window.appProgressImportFailed=()=>toast('Progress import was not completed.');
  window.appHandleBack=()=>{if($('.modal')){closeModal();return true;}if(state.lessonId){state.lessonId=null;render();return true;}if(state.tab!=='today'){navigate('today');return true;}return false;};
  async function boot(){
    let bundled=null;try{const res=await fetch('content.json');if(res.ok)bundled=validContent(await res.json());}catch(_){}
    let cached=null;try{const raw=bridge()?.getCachedContent?.();if(raw)cached=validContent(raw);}catch(_){}
    if(cached){try{setContent(cached);return;}catch(_){/* A cached render failure must never hide valid bundled lessons. */}}
    if(bundled){try{setContent(bundled);return;}catch(_){/* Show the recoverable load screen below if neither candidate can render. */}}
    $('#app').innerHTML=`<main class="boot"><div class="brand-mark">${icon('book')}</div><h1>Your study content could not open.</h1><p>Check your internet connection and try again. Existing progress stays in this browser.</p><button class="btn section-space" id="retry-load">Try again</button></main>`;$('#retry-load').addEventListener('click',boot);
  }
  boot();
})();
