(() => {
  const M = window.CostModel, view = document.body.dataset.view, key = 'crew-cost-library-demo-v2';
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = name => window.costIcons?.[name] || '';
  const money = v => v === null ? 'Unpriced' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v);
  let state = M.defaults(), selected = 'P02', category = 'All costs', search = '', dirty = false, message = '', error = '', caseId = 'absence', picked = '', selectionText = '', reason = '';
  try { const saved = localStorage.getItem(key); if (saved) state = M.validate(JSON.parse(saved)); } catch { message = 'Local data unavailable. Using demo defaults.'; }
  const r = () => M.rate(state, selected);
  const categories = ['All costs', 'Crew pay', 'Accommodation', 'Positioning', 'Other operating cash'];
  const number = (label, field, value, group = 'rate', extra = '') => `<label class="field"><span>${label}</span><input type="number" min="0" max="1000000000" step="any" data-group="${group}" data-field="${field}" value="${value ?? ''}" ${extra}></label>`;
  const button = (action, label, name, cls = '') => `<button type="button" data-action="${action}" class="${cls}">${icon(name)}${label}</button>`;
  const tool = (action, label, name) => `<button type="button" class="icon-btn" title="${label}" aria-label="${label}" data-action="${action}">${icon(name)}</button>`;
  const pill = (text, cls = '') => `<span class="pill ${cls}">${text}</span>`;
  const titleMap = { catalogue: ['Cost library', 'Rate catalogue'], workbench: ['Calculation workbench', 'Rule studio'], comparison: ['Recovery comparison', 'Decision desk'] };
  const tools = () => `<div class="tools">${tool('reset', 'Reset demo', 'RotateCcw')}${tool('import', 'Import configuration', 'Upload')}${tool('export', 'Export configuration', 'Download')}${button('save', 'Save draft', 'Save', 'primary')}</div>`;
  const nav = () => `<nav class="concept-nav" aria-label="Mockup alternatives">${[['catalogue','Catalogue'],['workbench','Workbench'],['comparison','Recovery']].map(([id,label],i) => `<a class="${view === id ? 'active' : ''}" href="${id}.html"><span>0${i+1}</span> ${label}</a>`).join('')}</nav>`;
  const top = () => `<header class="topbar"><a class="brand" href="catalogue.html"><span class="brand-symbol">${icon('Layers')}</span>ROIS<span class="brand-sub">CREW OPERATIONS</span></a>${nav()}<div class="top-meta">${pill('Demo data', 'amber')}<span class="avatar">RC</span></div></header>`;
  const heading = () => `<div class="page-heading"><div><div class="eyebrow">CONFIGURATION / ${titleMap[view][1].toUpperCase()}</div><h1>${titleMap[view][0]}</h1><div class="subline">Daily recovery <span>/</span> Illustrative USD rates <span>/</span> ${dirty ? 'Unsaved changes' : 'Local draft'}</div></div>${tools()}</div>`;
  const selectRule = () => `<label class="field rule-picker"><span>Cost type</span><select id="rule-select" aria-label="Cost type">${state.rates.map(v => `<option value="${v.id}" ${selected === v.id ? 'selected' : ''}>${v.id} - ${esc(v.name)}</option>`).join('')}</select></label>`;
  const tierEditor = current => `<section class="tier-editor" aria-label="Overage tiers"><div class="section-caption"><span>HOURS ABOVE GH</span>${button('add-tier','Add tier','Plus')}</div>${current.tiers.map((tier,i)=>`<div class="tier-row"><span class="tier-from">Above ${i ? current.tiers[i-1].upTo : current.guarantee} h</span><label class="field"><span>Through (h)</span><input type="number" aria-label="Tier ${i+1} upper hours" data-tier="${i}" data-tier-field="upTo" value="${tier.upTo ?? ''}" placeholder="Unlimited" ${tier.upTo === null ? 'disabled' : 'min="0" step="any"'}></label><label class="field"><span>Rate (x)</span><input type="number" aria-label="Tier ${i+1} multiplier" data-tier="${i}" data-tier-field="multiplier" min="0" step="0.1" value="${tier.multiplier}"></label><button class="icon-btn" title="Delete tier ${i+1}" aria-label="Delete tier ${i+1}" data-delete-tier="${i}" ${current.tiers.length===1?'disabled':''}>${icon('Minus')}</button></div>`).join('')}</section>`;
  const standbyInputs = () => `<section class="test-inputs standby-inputs"><div class="section-caption"><span>${icon('Clock')} STANDBY WHO FLIES</span>${pill('UTC / HH:MM')}</div><div class="form-grid"><label class="field"><span>Standby report (UTC)</span><input type="datetime-local" aria-label="Standby report (UTC)" data-group="fixture" data-field="report" value="${state.fixture.report}"></label><label class="field"><span>Pairing departure (UTC)</span><input type="datetime-local" aria-label="Pairing departure (UTC)" data-group="fixture" data-field="departure" value="${state.fixture.departure}"></label>${number('Pairing credit (h)', 'added', state.fixture.added, 'fixture')}${number('Standby credit already in baseline (h)', 'baselineStandby', state.fixture.baselineStandby, 'fixture')}</div><div class="standby-results"><div><span>Eligible standby</span><strong data-testid="eligible-standby">${M.hours(M.standby(state)?.elapsed ?? null)}</strong></div><div><span>Standby pay / flight credit</span><strong data-testid="standby-credit">${M.hours(M.standby(state)?.credit ?? null)}</strong></div><div><span>Total assignment credit</span><strong data-testid="assignment-credit">${M.hours(M.standby(state)?.assignment ?? null)}</strong></div></div></section>`;
  const editor = () => {
    const current = r();
    return `<section class="editor" aria-label="Cost rule editor"><div class="section-caption"><span>${icon('SlidersHorizontal')} COST DEFINITION</span>${pill(current.enabled ? 'Enabled' : 'Disabled', current.enabled ? 'green' : '')}</div>
      ${view === 'catalogue' ? `<div class="editor-title"><span class="code">${current.id}</span><h2>${esc(current.name)}</h2></div>` : selectRule()}
      <div class="editor-meta">${esc(current.source)} <span> / </span> ${esc(current.scope)}</div>
      <label class="field"><span>Cost name</span><input data-group="rate" data-field="name" value="${esc(current.name)}" maxlength="160"></label>
      ${current.template==='standby' ? `<div class="form-grid">${number('X - standby credit factor','factor',current.factor)}${number('Y - hours before departure','cutoffHours',current.cutoffHours)}</div><div class="editor-meta">Credit output / valued through the GH pay rule. No fixed activation fee.</div>` : `<div class="form-grid">${number('Unit price (USD)', 'rate', current.rate)}<label class="field"><span>Billing unit</span><input value="${esc(current.unit)}" readonly aria-label="Billing unit"></label></div>`}
      <label class="field"><span>Calculation logic</span><select aria-label="Calculation logic" data-group="rate" data-field="template">${M.allowed(current).map(t=>`<option value="${t}" ${current.template === t ? 'selected' : ''}>${M.templates[t]}</option>`).join('')}</select></label>
      ${current.template === 'guarantee' ? `${number('Guaranteed hours', 'guarantee', current.guarantee)}${tierEditor(current)}` : ''}
      ${current.template === 'minimum' ? number('Minimum billable quantity', 'minimum', current.minimum) : ''}
      ${current.template === 'bands' ? `<div class="form-grid">${number('First band ends (min)', 'threshold', current.threshold)}${number('Rate after first band', 'upperRate', current.upperRate)}</div>` : ''}
      ${current.template === 'booking' ? `<div class="form-grid">${number('Original booking (USD)', 'original', current.original)}${number('Refund available (USD)', 'refund', current.refund)}${number('Change fee (USD)', 'fee', current.fee)}</div>` : ''}
      <label class="check"><input type="checkbox" data-group="rate" data-field="enabled" ${current.enabled ? 'checked' : ''}> Enabled in calculations</label>
      <div class="formula-box"><div class="eyebrow">CALCULATION</div><code>${esc(M.formula(current))}</code></div>
      <div class="editor-error" role="alert">${esc(error)}</div>
      <div class="editor-foot">${button('duplicate', 'Duplicate cost', 'Copy')}${button('save', 'Save rule', 'Check', 'primary')}</div>
    </section>`;
  };
  const preview = () => {
    const current = r(), a = M.crew(state, 'A');
    if (current.template === 'standby') return standbyInputs();
    let value, inputs, caption;
    if (current.template === 'guarantee') {
      value = a.delta; caption = 'Crew A / incremental pay';
      inputs = `<div class="form-grid">${number('Baseline credit A (h)', 'beforeA', state.fixture.beforeA, 'fixture')}${number('Pairing credit (h)', 'added', state.fixture.added, 'fixture')}</div>`;
    } else if (current.template === 'bands') {
      value = M.cost(current, 1, state.fixture.delayBefore, state.fixture.delayAfter); caption = 'Additional flight delay cost';
      inputs = `<div class="form-grid">${number('Baseline delay (min)', 'delayBefore', state.fixture.delayBefore, 'fixture')}${number('Candidate delay (min)', 'delayAfter', state.fixture.delayAfter, 'fixture')}</div>`;
    } else {
      value = M.cost(current, state.fixture.quantity); caption = current.template === 'booking' ? 'Additional booking obligation' : `Sample / ${state.fixture.quantity} ${esc(current.unit)}s`;
      inputs = current.template === 'booking' ? '' : number('Test quantity', 'quantity', state.fixture.quantity, 'fixture');
    }
    return `<section class="preview"><div class="section-caption"><span>${icon('Calculator')} TEST CALCULATION</span>${pill('Live preview')}</div>${inputs}<div class="preview-result"><span>${caption}</span><strong data-testid="sample-result">${money(value)}</strong></div></section>`;
  };
  const table = () => {
    const shown = state.rates.filter(v => (category === 'All costs' || v.category === category) && `${v.id} ${v.name} ${v.unit}`.toLowerCase().includes(search.toLowerCase()));
    return `<div class="table-scroll" tabindex="0" aria-label="Cost catalogue table"><table class="cost-table"><thead><tr><th>Cost type</th><th>Unit price / credit</th><th>Calculation</th><th>Status</th></tr></thead><tbody>${shown.map(v => `<tr class="${selected === v.id ? 'selected' : ''}"><td><button class="row-button" data-select="${v.id}"><span class="row-icon ${v.category === 'Accommodation' ? 'ochre' : v.category === 'Positioning' ? 'blue' : ''}">${icon(v.category === 'Accommodation' ? 'Hotel' : v.category === 'Positioning' ? 'Plane' : 'Coins')}</span><span><strong>${esc(v.name)}</strong><small>${v.id} <span>/</span> ${esc(v.unit)}</small></span></button></td><td class="numeric">${v.template==='standby'?`${v.factor}x credit`:money(v.rate)}</td><td><span class="template-label">${M.templates[v.template]}</span></td><td>${pill(!v.enabled ? 'Disabled' : v.template==='standby'?'Credit rule':v.rate === null ? 'Unpriced' : 'Draft', v.rate === null && v.template!=='standby' ? 'amber' : '')}</td></tr>`).join('')}</tbody></table>${shown.length ? '' : '<div class="empty">No matching cost types.</div>'}</div><div class="table-footer">${shown.length} cost types <span>Prices are illustrative, not approved airline tariffs.</span></div>`;
  };
  const catalogue = () => `<div class="catalogue-layout"><aside class="sidebar"><div class="sidebar-label">LIBRARY</div>${categories.map((c,i)=>`<button class="side-link ${category === c ? 'selected' : ''}" data-category="${c}">${icon(['LayoutGrid','Coins','Hotel','Plane','ChartNoAxesCombined'][i])}<span>${c}</span><small>${c === 'All costs' ? state.rates.length : state.rates.filter(v=>v.category===c).length}</small></button>`).join('')}<div class="sidebar-bottom"><span class="dot"></span> Daily recovery<div>Rate set <strong>DEMO-2026.09</strong></div><div>Currency <strong>USD</strong></div></div></aside><main>${heading()}<div class="catalogue-content"><section class="catalogue-list"><div class="list-toolbar"><div class="search">${icon('Search')}<input id="search" type="search" placeholder="Search costs, IDs or units" aria-label="Search costs" value="${esc(search)}"></div>${button('duplicate','Add from selected','Plus')}</div><div class="summary-strip"><div><strong>${state.rates.length}</strong><span>Cost types</span></div><div><strong>${state.rates.filter(v=>(v.rate!==null || v.template==='standby') && v.enabled).length}</strong><span>Configured & enabled</span></div><div><strong>${state.rates.filter(v=>v.rate===null && v.template!=='standby').length}</strong><span>Awaiting tariff</span></div></div><div id="cost-table">${table()}</div></section><aside class="detail-column">${editor()}${preview()}</aside></div></main></div>`;
  const creditChart = (c, g, max) => `<div class="credit-chart" role="img" aria-label="Crew ${c.who}: ${c.before} baseline hours, ${c.after} candidate hours; guarantee ${g} hours"><div class="chart-label"><span>Crew ${c.who}</span><span>${c.before} h <b>to</b> ${c.after} h</span></div><div class="track"><div class="credit-before" style="width:${Math.min(100,c.before/max*100)}%"></div><div class="credit-after" style="width:${Math.min(100,c.after/max*100)}%"></div><span class="guarantee-line" style="left:${g/max*100}%"></span></div><div class="chart-scale"><span>0 h</span><span>GH ${g} h</span><span>${max} h</span></div></div>`;
  const comparisonCalc = () => {
    const a = M.crew(state, 'A'), b = M.crew(state, 'B'), g = M.rate(state,'P02').guarantee, max = Math.ceil(Math.max(g,a.after,b.after,a.before,b.before,1)*1.15/5)*5;
    return `<section class="crew-test"><div class="section-caption"><span>${icon('Users')} GUARANTEE-HOUR COMPARISON</span>${pill('User-defined demo policy','amber')}</div><div class="crew-chart-grid">${creditChart(a,g,max)}${creditChart(b,g,max)}</div><div class="table-scroll"><table class="result-table"><thead><tr><th>Cost breakdown</th><th>Crew A</th><th>Crew B</th></tr></thead><tbody><tr><td>Payable credit after recovery</td><td>${M.hours(a.after)}</td><td>${M.hours(b.after)}</td></tr><tr><td>Standby credit (HH:MM)</td><td>${M.hours(a.standby)}</td><td>${M.hours(b.standby)}</td></tr><tr><td>Pairing + standby credit (HH:MM)</td><td>${M.hours(a.assignment)}</td><td>${M.hours(b.assignment)}</td></tr><tr><td>Baseline standby credit replaced</td><td>${M.hours(state.fixture.baselineStandby)}</td><td>${M.hours(state.fixture.baselineStandby)}</td></tr><tr class="total"><td>Incremental crew cash</td><td data-testid="crew-a-total">${money(a.total)}</td><td data-testid="crew-b-total">${money(b.total)}</td></tr></tbody></table></div><div class="savings">${icon('ArrowDownRight')}<span>Difference in crew cash</span><strong data-testid="crew-difference">${a.total===null || b.total===null ? 'Unpriced' : money(Math.abs(a.total-b.total))}</strong></div></section>`;
  };
  const workbench = () => `<main class="workbench-main">${heading()}<div class="workflow"><span class="current">01 <b>Define cost</b></span>${icon('ChevronRight')}<span>02 <b>Configure calculation</b></span>${icon('ChevronRight')}<span>03 <b>Compare outcomes</b></span></div><div class="workbench-layout"><aside>${editor()}</aside><div class="workbench-results"><section class="test-inputs"><div class="section-caption"><span>${icon('FlaskConical')} CREW TEST INPUTS</span><span class="muted">Same assignment / two crew members</span></div><div class="four-grid">${number('Baseline credit A (h)', 'beforeA', state.fixture.beforeA,'fixture')}${number('Baseline credit B (h)', 'beforeB', state.fixture.beforeB,'fixture')}${number('Removed future credit (h)', 'removed', state.fixture.removed,'fixture')}</div></section>${standbyInputs()}${comparisonCalc()}${r().template==='standby'?'':preview()}<div class="method-note">${icon('Info')}<div><strong>Period-level calculation</strong><p>Existing guarantee pay is retained. Standby credit already in the baseline is replaced, not added twice. Contractual flight-time credit is not actual operated block time.</p></div></div></div></div></main>`;
  const caseInfo = {
    absence: { label: 'Crew absence', flight: 'DEMO 101 / 102', route: 'ADD - DIR - ADD', status: 'Open position', text: 'Sick call before report. One qualified crew member required.', type: 'Operational event', time: 'Report 05:30', rule: 'Minimum crew complement', severity: 'amber' },
    retiming: { label: 'Flight retiming', flight: 'DEMO 210 / 211', route: 'ADD - OUT - ADD', status: 'Advance warning', text: 'Revised return may exceed the duty limit by 30 minutes.', type: 'Simulated rule warning', time: 'Projected breach 01:30', rule: 'Maximum flight duty period', severity: 'amber' },
    outstation: { label: 'Outstation disruption', flight: 'DEMO 302', route: 'OUT - ADD', status: 'Actual violation', text: 'Current crew cannot operate the revised departure before rest.', type: 'Simulated rule violation', time: 'Aircraft ready 16:00', rule: 'Minimum rest before next duty', severity: 'red' },
    aircraft: { label: 'Aircraft change', flight: 'DEMO 140 / 141', route: 'ADD - OUT - ADD', status: 'Actual violation', text: 'Replacement aircraft requires TYPE-L qualified flight crew.', type: 'Simulated rule violation', time: 'Report 14:00', rule: 'Aircraft type qualification', severity: 'red' }
  };
  const options = () => {
    const fee = (id,q=1) => M.cost(M.rate(state,id),q);
    const sum = (...v) => v.some(x=>x===null) ? null : v.reduce((a,b)=>a+b,0);
    const times = (v,n) => v===null ? null : v*n;
    const reservePay = M.crew(state,'A').total;
    const delay = minutes => {const d=M.rate(state,'X01');return M.cost(d,minutes,0,minutes);};
    const make = (id,name,crewCost,mins,reserves,rosters,margin,detail,status='Eligible') => ({id,name,crew:crewCost,delay:mins,other:delay(mins),reserves,rosters,margin,detail,status});
    if (caseId === 'absence') return [
      make('a','Airport standby / Crew A',M.crew(state,'A').total,0,1,1,95,'Standby + pairing credit valued through GH tiers. No fixed activation fee.'),
      make('b','Airport standby / Crew B',M.crew(state,'B').total,15,1,1,80,'Lower pay-period liability; duty handover adds 15 minutes.'),
      make('recall','Day-off recall',fee('P07'),0,0,1,100,'Recall fee only in this fixture; required crew consent has not been received.','Consent pending')
    ];
    if (caseId === 'retiming') return [
      make('swap','Swap with shorter rotation',times(fee('P09'),2),0,0,2,65,'Two qualifying roster-change payments. Both resulting duties checked in the fixture.'),
      make('reserve','Replace with standby',reservePay,20,1,1,120,'Standby and pairing credit through GH tiers; Crew A test inputs.'),
      make('rest','Rest and return tomorrow',sum(times(fee('L01'),6),times(fee('L03'),6)),600,0,6,180,'Six room-nights and six person-days; no added payroll in this fixture.')
    ];
    if (caseId === 'outstation') return [
      make('own','Position team / own airline',sum(times(reservePay,6),fee('L04',12),fee('L02',6)),390,6,12,90,'Six demo crew with A pay inputs, 12 seat-sectors and six day rooms. Credit inputs are illustrative.'),
      make('partner','Position team / partner airline',sum(times(reservePay,6),fee('L05',6),fee('L04',6),fee('L02',6)),360,6,12,100,'Six demo crew with A pay inputs, six partner seats, six return seats and rooms.'),
      make('wait','Rest original team and return',sum(fee('L01',6),fee('L03',6)),690,0,6,140,'Six hotel nights and person-days; original guarantee pay unchanged.')
    ];
    return [
      make('qualified','Qualified standby + reuse stood-down crew',times(reservePay,2),30,2,4,90,'Two TYPE-L crew with A pay inputs. Two TYPE-S callouts avoided; TYPE-L consumption stays at two.'),
      make('swap','Swap TYPE-L crew + backfill',sum(times(reservePay,2),times(fee('P09'),4)),15,2,4,70,'Two backfill crew with A pay inputs plus four short-notice roster changes.'),
      make('illegal','Retain original TYPE-S crew',0,0,0,0,0,'No TYPE-L qualification in the fixture. A price cannot override this rule.','Rejected')
    ];
  };
  const total = o => o.crew===null || o.other===null ? null : o.crew+o.other;
  const score = o => state.policy.objective === 'crew' ? o.crew : total(o);
  const optionRows = () => options().map(o => `<tr class="${picked===o.id?'selected':''} ${o.status==='Rejected'?'rejected':''}"><td><strong>${o.name}</strong><small>${o.detail}</small></td><td>${pill(o.status,o.status==='Eligible'?'green':o.status==='Rejected'?'red':'amber')}</td><td class="numeric">${money(o.crew)}</td><td class="numeric">${money(total(o))}</td><td>${o.delay} min</td><td>${o.reserves}</td><td>${o.rosters}</td><td>${o.status==='Rejected'?'--':o.margin+' min'}</td><td><button class="select-option ${picked===o.id?'primary':''}" data-pick="${o.id}" ${o.status!=='Eligible' || total(o)===null?'disabled':''}>${picked===o.id ? icon('Check')+'Selected' : 'Select'}</button></td></tr>`).join('');
  const comparison = () => {
    const info=caseInfo[caseId];
    return `<main class="comparison-main">${heading()}<div class="case-tabs" role="group" aria-label="Disruption type">${Object.entries(caseInfo).map(([id,c])=>`<button data-case="${id}" class="${caseId===id?'active':''}">${icon(id==='aircraft'?'Plane':id==='retiming'?'Clock':id==='outstation'?'MapPin':'UserRoundX')}${c.label}</button>`).join('')}</div><section class="case-banner"><div class="case-marker">${icon('Activity')}</div><div><div class="section-caption"><span>${info.flight} <b>/</b> ${info.route}</span>${pill(info.status,info.severity)}</div><h2>${info.text}</h2><div class="subline">${info.type} <span>/</span> ${info.rule} <span>/</span> ${info.time}</div></div></section><div class="decision-toolbar"><div><h2>Recovery options</h2><span class="muted">Simulated legality assessments / same case baseline</span></div><span class="muted">${options().filter(o=>o.status==='Eligible').length} eligible options</span></div><div class="table-scroll option-table" tabindex="0" aria-label="Recovery options"><table><thead><tr><th>Recovery action</th><th>Legality / consent</th><th>Crew cash</th><th>Total cash</th><th>Added delay</th><th>Reserves</th><th>Rosters</th><th>Legal margin</th><th>Decision</th></tr></thead><tbody>${optionRows()}</tbody></table></div><div class="decision-bottom"><section class="policy"><div class="section-caption"><span>${icon('GitBranch')} SELECTION POLICY</span>${pill('Local simulation','amber')}</div><h2>User-defined selection</h2><label class="field"><span>Lowest-cost objective</span><select data-group="policy" data-field="objective"><option value="crew" ${state.policy.objective==='crew'?'selected':''}>Incremental crew cash</option><option value="total" ${state.policy.objective==='total'?'selected':''}>Total incremental cash</option></select></label>${number('Automatic selection cap (USD)', 'maxCost', state.policy.maxCost, 'policy')}<div class="policy-rule">${icon('ShieldCheck')} Legal + consent complete + fully priced<br>Then cost, reserves used, rosters changed</div><label class="field"><span>Manual decision reason</span><input id="decision-reason" placeholder="Reason for choosing this option" value="${esc(reason)}"></label>${button('auto','Run automatic selection','Play','primary')}<div class="decision-status" role="status">${esc(selectionText || 'Awaiting user selection or policy run.')}</div></section><div class="comparison-editor">${editor()}</div><section class="cash-chart"><div class="section-caption"><span>${icon('ChartNoAxesCombined')} CASH COMPARISON</span></div><h2>Cost of each option</h2>${options().map(o=>`<div class="cost-bar"><div><span>${o.name}</span><strong>${money(total(o))}</strong></div><div class="bar-track"><span style="width:${total(o)===null?0:Math.max(0,total(o))/Math.max(1,...options().map(p=>total(p)||0))*100}%"></span></div></div>`).join('')}<div class="chart-key"><i></i> Total cash, including flight delay</div><div class="method-note"><div><strong>Selection is not deployment</strong><p>No roster changes or bookings are made. Revalidation is required before operational application.</p></div></div></section></div></main>`;
  };
  const notify = text => {message=text;const el=document.getElementById('status');if(el)el.textContent=text;};
  const render = () => {
    document.getElementById('app').innerHTML = `${top()}${view==='catalogue'?catalogue():view==='workbench'?workbench():comparison()}<footer class="app-footer"><span>${icon('ShieldCheck')} Local prototype / no operational writes</span><span id="status" role="status">${esc(message)}</span><span>DEMO-2026.09</span></footer><input id="import-file" type="file" accept="application/json,.json" hidden>`;
    bind();
  };
  const persist = () => {try {localStorage.setItem(key,JSON.stringify(state));dirty=false;return true;}catch{notify('Storage unavailable. Export configuration to retain this draft.');return false;}};
  const change = event => {
    const el=event.target, next=structuredClone(state), target=el.dataset.group==='rate'?M.rate(next,selected):next[el.dataset.group];
    const value=el.type==='checkbox'?el.checked:el.type==='number'?(el.value===''?null:Number(el.value)):el.value;
    target[el.dataset.field]=value;
    try {M.validate(next);state=next;dirty=true;error='';picked='';selectionText='Inputs changed. Selection requires re-evaluation.';message='Draft updated. Save to retain changes.';render();}catch(e){error=e.message;document.querySelector('.editor-error').textContent=error;el.setAttribute('aria-invalid','true');notify(error);}
  };
  const updateTiers = mutate => {
    const next = structuredClone(state);
    mutate(M.rate(next,selected));
    try { M.validate(next); state=next;dirty=true;error='';picked='';selectionText='Inputs changed. Selection requires re-evaluation.';message='Tier configuration updated.';render(); }
    catch(e) { error=e.message;document.querySelector('.editor-error').textContent=error;notify(error); }
  };
  const auto = () => {
    if(error){notify('Correct invalid configuration before selecting.');return;}
    const eligible=options().filter(o=>o.status==='Eligible' && total(o)!==null && score(o)<=state.policy.maxCost).sort((a,b)=>score(a)-score(b)||a.reserves-b.reserves||a.rosters-b.rosters);
    if(!eligible.length){picked='';selectionText='Manual review required: no eligible, fully priced option within the cap.';}
    else if(eligible[1] && score(eligible[0])===score(eligible[1]) && eligible[0].reserves===eligible[1].reserves && eligible[0].rosters===eligible[1].rosters){picked='';selectionText='Manual review required: policy tie remains.';}
    else {picked=eligible[0].id;selectionText=`Automatically selected: ${eligible[0].name}. Lowest ${state.policy.objective==='crew'?'crew':'total'} cash ${money(score(eligible[0]))}. Not deployed.`;}
    render();
  };
  const bind = () => {
    document.querySelectorAll('[data-tier]').forEach(el=>el.onchange=()=>updateTiers(current=>{current.tiers[Number(el.dataset.tier)][el.dataset.tierField]=el.value===''?NaN:Number(el.value);}));
    document.querySelectorAll('[data-delete-tier]').forEach(el=>el.onclick=()=>updateTiers(current=>{if(current.tiers.length<=1)return;current.tiers.splice(Number(el.dataset.deleteTier),1);current.tiers[current.tiers.length-1].upTo=null;}));
    document.querySelectorAll('[data-group]').forEach(el=>el.addEventListener('change',change));
    document.querySelectorAll('[data-select]').forEach(el=>el.onclick=()=>{selected=el.dataset.select;error='';render();});
    document.querySelectorAll('[data-category]').forEach(el=>el.onclick=()=>{category=el.dataset.category;render();});
    document.querySelectorAll('[data-case]').forEach(el=>el.onclick=()=>{caseId=el.dataset.case;picked='';selectionText='';render();});
    document.querySelectorAll('[data-pick]').forEach(el=>el.onclick=()=>{if(!reason.trim()){notify('Enter a manual decision reason before selecting.');document.getElementById('decision-reason').focus();return;}picked=el.dataset.pick;selectionText=`Selected by user: ${options().find(o=>o.id===picked).name}. Reason: ${reason}. Not deployed.`;render();});
    document.getElementById('decision-reason')?.addEventListener('input',e=>{reason=e.target.value;});
    document.getElementById('rule-select')?.addEventListener('change',e=>{selected=e.target.value;error='';render();});
    document.getElementById('search')?.addEventListener('input',e=>{search=e.target.value;document.getElementById('cost-table').innerHTML=table();document.querySelectorAll('[data-select]').forEach(el=>el.onclick=()=>{selected=el.dataset.select;error='';render();});});
    document.querySelectorAll('[data-action]').forEach(el=>el.onclick=()=>{
      const action=el.dataset.action;
      if(action==='add-tier')updateTiers(current=>{const last=current.tiers[current.tiers.length-1];current.tiers.splice(current.tiers.length-1,0,{upTo:(current.tiers.length>1?current.tiers[current.tiers.length-2].upTo:current.guarantee)+5,multiplier:last.multiplier});});
      if(action==='save'){if(error){notify('Correct the invalid input before saving.');return;}if(persist()){message='Draft saved locally.';render();}}
      if(action==='reset'){state=M.defaults();selected='P02';dirty=true;error='';picked='';selectionText='';message='Demo defaults restored. Save to retain.';render();}
      if(action==='duplicate'){
        if(['guarantee','standby','bands','booking'].includes(r().template)){notify('Select a fixed or quantity cost to duplicate.');return;}
        if(state.rates.length>=100){notify('Maximum 100 demo cost types.');return;}
        const copy={...r(),id:`CUSTOM-${Date.now()}`,name:`${r().name} copy`};state.rates.push(copy);selected=copy.id;category='All costs';search='';dirty=true;render();
      }
      if(action==='auto')auto();
      if(action==='export'){const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='crew-cost-library.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Configuration exported.');}
      if(action==='import')document.getElementById('import-file').click();
    });
    document.getElementById('import-file').onchange=async e=>{
      const file=e.target.files[0];if(!file)return;
      try{if(file.size>1000000)throw Error('Configuration exceeds 1 MB.');state=M.validate(JSON.parse(await file.text()));selected='P02';error='';dirty=true;picked='';selectionText='';message='Configuration imported. Review and save draft.';render();}catch(e){notify(`Import rejected: ${e.message}`);}
    };
  };
  render();
})();
