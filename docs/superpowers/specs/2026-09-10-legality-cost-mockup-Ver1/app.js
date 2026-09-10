/* Isolated design-review state; no production services or tariff claims. */
(() => {
  const M = window.CostModel, icons = window.costIcons;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => value === null ? 'Unpriced' : new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'}).format(value);
  const icon = name => icons[name] || icons.SlidersHorizontal;
  const button = (action, name, title, key = '', text = '') => `<button type="button" data-action="${action}" data-key="${key}" title="${title}" aria-label="${title}">${icon(name)}${text}</button>`;
  const defaults = M.defaults();
  const records = defaults.rates.map(r => ({...structuredClone(r),type:(r.id[0] === 'P' ? 1000 : r.id[0] === 'L' ? 2000 : 3000) + Number(r.id.slice(1)),instance:1, updated:'Ryan', ghPolicy:'1002/001', fixture:structuredClone(defaults.fixture)}));
  const key = r => `${r.type}/${String(r.instance).padStart(3,'0')}`;
  let sets = [{id:1,name:'Daily Recovery',description:'Daily operations · all cost instances',enabled:true,members:records.map(key)}, {id:2,name:'Crew Pay & Reserve',description:'Crew pay · standby and recall',enabled:true,members:records.filter(r=>r.category==='Crew pay').map(key)}, {id:3,name:'Positioning & Accommodation',description:'Crew travel · overnight recovery',enabled:true,members:records.filter(r=>r.id[0]==='L').map(key)}];
  let selectedSet = 1, view = 'Cost Sets', selectedCost = '', search = '', setSearch = '', expanded = new Set(['1002/001']), collapsed = new Set(), dialogSave;
  const get = id => records.find(r=>key(r)===id);
  const paramCount = r => 2 + (r.template==='standby'?3:1) + (r.template==='guarantee'?r.tiers.length*2:r.template==='booking'?3:r.template==='bands'?2:r.template==='minimum'?1:0);
  const currentSet = () => sets.find(s=>s.id===selectedSet);
  const input = (label,field,value,type='number',extra='') => `<label>${label}<input data-field="${field}" type="${type}" value="${esc(value)}" ${type==='number'?'min="0" step="any"':''} ${extra}></label>`;
  const note = message => { const t=document.querySelector('#toast');t.textContent=message;t.style.display='block';setTimeout(()=>t.style.display='none',2600); };
  const fixtureFields = r => {
    if (r.template === 'standby') return input('Report (UTC)','report',r.fixture.report,'datetime-local') + input('Pairing departure (UTC)','departure',r.fixture.departure,'datetime-local') + input('Pairing credit (hours)','added',r.fixture.added) + input('Baseline monthly credit','beforeA',r.fixture.beforeA) + input('Standby credit in baseline','baselineStandby',r.fixture.baselineStandby) + input('Removed unprotected credit','removed',r.fixture.removed);
    if (r.template === 'guarantee') return input('Monthly credit before','beforeA',r.fixture.beforeA) + input('Additional credit (hours)','added',r.fixture.added) + input('Removed unprotected credit','removed',r.fixture.removed);
    if (r.template === 'bands') return input('Delay before (minutes)','delayBefore',r.fixture.delayBefore) + input('Delay after (minutes)','delayAfter',r.fixture.delayAfter);
    if (r.template === 'booking') return '<div class="subtitle">One booking replacement · refund is applied against the existing booking.</div>';
    return input(r.template === 'fixed' ? 'Qualifying event (0 = no, 1 = yes)' : `Billable quantity (${esc(r.unit)})`,'quantity',r.fixture.quantity,'number',r.template==='fixed'?'max="1"':'');
  };
  const params = r => {
    let html = `<div class="fields">${r.template !== 'standby' ? input('Unit price (USD)','rate',r.rate ?? '') : input('Standby credit factor X','factor',r.factor)+input('Departure cutoff Y (hours)','cutoffHours',r.cutoffHours)}<label>Calculation logic<select data-field="template">${M.allowed(r).map(t=>`<option value="${t}" ${t===r.template?'selected':''}>${M.templates[t]}</option>`).join('')}</select></label>${input('Applicability','scope',r.scope,'text')}${r.template==='guarantee'?input('Guarantee floor (hours)','guarantee',r.guarantee):''}${r.template==='minimum'?input('Minimum billable quantity','minimum',r.minimum):''}${r.template==='bands'?input('First band through (minutes)','threshold',r.threshold)+input('Rate above threshold (USD/min)','upperRate',r.upperRate):''}${r.template==='booking'?input('Original booking (USD)','original',r.original)+input('Refund (USD)','refund',r.refund)+input('Change fee (USD)','fee',r.fee):''}</div>`;
    if(r.template==='guarantee') html += `<table class="tiers"><thead><tr><th>Credit above</th><th>Through hours</th><th>Rate multiplier</th><th></th></tr></thead><tbody>${r.tiers.map((t,i)=>`<tr><td>${i ? r.tiers[i-1].upTo : r.guarantee} h</td><td>${t.upTo===null?'No upper limit':`<input aria-label="Tier ${i+1} upper hours" data-tier="${i}" data-part="upTo" type="number" min="0" step="any" value="${t.upTo}">`}</td><td><input aria-label="Tier ${i+1} multiplier" data-tier="${i}" data-part="multiplier" type="number" min="0" step="any" value="${t.multiplier}"></td><td>${button('delete-tier','Minus','Delete tier',`${key(r)}:${i}`)}</td></tr>`).join('')}</tbody></table>${button('add-tier','Plus','Add tier',key(r),'Add tier')}`;
    if(r.template==='standby') html+=`<label>GH policy instance<select data-field="ghPolicy">${records.filter(x=>x.template==='guarantee').map(x=>`<option value="${key(x)}" ${r.ghPolicy===key(x)?'selected':''}>${key(x)} · ${esc(x.name)}</option>`).join('')}</select></label>`;
    return html;
  };
  const detail = r => `<div class="detail" data-detail="${key(r)}"><div class="section-title">${icon('SlidersHorizontal')} Parameters <span class="badge">${r.instance===1?'Template':'Instance'}</span></div><div class="parameters">${params(r)}</div><div class="parameter-actions">${button('save-params','Save','Save parameters',key(r),'Save parameters')}<span class="subtitle">${esc(r.source)}</span></div><div class="workbench"><div class="section-title">${icon('Calculator')} Calculation Workbench <span class="badge">${key(r)}</span></div><div class="formula">${esc(M.formula(r))}</div><div class="fields fixture">${fixtureFields(r)}</div>${button('calculate','Play','Calculate',key(r),'Calculate')}<div class="calculation" aria-live="polite"></div></div></div>`;
  const row = r => `<article data-record="${key(r)}" class="${expanded.has(key(r))?'expanded':''}"><div class="rowhead"><div><strong><span class="id">${key(r)}</span>${esc(r.name)}</strong><small>${esc(r.source)}</small></div><div class="optional"><span class="badge">${esc(r.category)}</span><small>${r.instance===1?'Template':'Copy'}</small></div><div><span>${r.template==='standby'?`${r.factor}× credit`:money(r.rate)}</span><small>per ${esc(r.unit)}</small></div><div class="optional"><span>${esc(r.updated)}</span><small>${r.enabled?'Enabled':'Disabled'}</small></div><div class="actions">${button('expand','ChevronRight',expanded.has(key(r))?'Collapse cost':'Expand cost',key(r))}${button('copy','Copy','Copy cost instance',key(r))}${button('meta','SlidersHorizontal','Edit cost details',key(r))}</div></div>${expanded.has(key(r))?detail(r):''}</article>`;
  const render = () => {
    document.querySelector('#nav').innerHTML=['Rule Sets','Rule Templates','Cost Sets','Cost Templates'].map((n,i)=>`<button data-action="nav" data-key="${n}" class="${view===n?'active':''}">${icon(i<2?'ShieldCheck':'Coins')}${n}</button>`).join('');
    const templates=view==='Cost Templates';
    document.querySelector('.sets').style.display=templates?'none':'';
    document.querySelector('.shell').style.gridTemplateColumns=templates && innerWidth>760?'180px 190px minmax(0,1fr)':'';
    document.querySelector('#tree-title').textContent=templates?'Cost Templates':'Cost Instances';
    const available=records.filter(r=>(!templates||r.instance===1)&&(`${key(r)} ${r.name}`.toLowerCase().includes(search.toLowerCase())));
    document.querySelector('#count').textContent=available.length;
    document.querySelector('#tree').innerHTML=`<button data-action="filter" data-key="" class="${!selectedCost?'selected':''}">${icon('Layers')} All costs <span class="badge">${available.length}</span></button>`+[...new Set(available.map(r=>r.category))].map(c=>`<button class="category" data-action="category" data-key="${c}">${icon('ChevronRight')}${c}</button>${collapsed.has(c)?'':available.filter(r=>r.category===c).map(r=>`<button data-action="filter" data-key="${key(r)}" class="${selectedCost===key(r)?'selected':''}"><span><span class="id">${key(r)}</span><br>${esc(r.name)}</span></button>`).join('')}`).join('');
    document.querySelector('#new-set').innerHTML=icon('Plus');
    document.querySelector('#sets').innerHTML=sets.filter(s=>s.name.toLowerCase().includes(setSearch.toLowerCase())).map(s=>`<button data-action="select-set" data-key="${s.id}" class="set ${s.id===selectedSet?'selected':''}"><strong>${esc(s.name)}</strong><div class="meta"><span>CS-${String(s.id).padStart(3,'0')}</span><span class="badge">${s.enabled?'Enabled':'Disabled'}</span></div><p>${esc(s.description)}</p><div class="meta"><span>${s.members.length} costs</span><span>F8 · USD</span></div></button>`).join('');
    const s=currentSet();
    const shown=available.filter(r=>(templates||selectedCost||s?.members.includes(key(r)))&&(!selectedCost||key(r)===selectedCost));
    document.querySelector('#main').innerHTML=`<div class="titlebar"><h1>${templates?'Cost Templates':esc(s?.name || 'Cost Sets')} <span class="badge">${shown.length} costs</span></h1><div class="subtitle">${templates?'Master cost catalogue · protected 001 templates':esc(s?.description||'Create a cost set')} · USD</div></div><div class="toolbar">${!templates&&s?button('members','Plus','Add or remove costs','','Manage costs')+button('edit-set','SlidersHorizontal','Edit set','','Edit')+button('copy-set','Copy','Copy set','','Copy')+button('delete-set','Minus','Delete set','','Delete'):''}${button('expand-all','Layers','Expand all costs','','Expand all')}${button('recalculate','Calculator','Recalculate workbenches','','Recalculate')}</div><div class="tablehead"><span>Cost ID / Description</span><span class="optional">Category / Source</span><span>Unit price</span><span class="optional">Updated by</span><span>Actions</span></div>${shown.length?shown.map(row).join(''):'<div class="empty">No costs match this selection.</div>'}<div class="reference-note">Prototype Ver1 · Illustrative configuration, not verified airline tariffs. Operational costs are separate from crew pay. No live legality checks.</div>`;
    document.querySelectorAll('[data-record]').forEach(el=>{const item=get(el.dataset.record);const info=document.createElement('small');info.textContent=`${paramCount(item)} parameters${!templates&&!s?.members.includes(key(item))?' · Not in selected set':''}`;el.querySelector('.rowhead > div').append(info);});
    shown.filter(r=>expanded.has(key(r))).forEach(calculate);
  };
  const calculate = r => {
    const target=document.querySelector(`[data-detail="${key(r)}"] .calculation`);if(!target)return;
    if(!r.enabled){target.innerHTML='<div class="subtitle">Disabled cost · excluded from calculation.</div>';return;}
    try {
      let result, breakdown='';const f=r.fixture;
      if((r.template==='guarantee'||r.template==='standby') && f.removed>f.beforeA)throw Error('Removed credit cannot exceed baseline monthly credit.');
      if(r.template==='standby') {
        const state=M.defaults();state.rates[state.rates.findIndex(x=>x.id==='P03')]=r;state.rates[state.rates.findIndex(x=>x.id==='P02')]=get(r.ghPolicy);state.fixture={...f,beforeB:f.beforeA};M.validate(state);
        const c=M.crew(state,'A');result=c.delta;breakdown=`<div><small>Eligible standby</small><strong>${M.hours(M.standby(state).elapsed)}</strong></div><div><small>Standby credit</small><strong>${M.hours(c.standby)}</strong></div><div><small>Assignment credit</small><strong>${M.hours(c.assignment)}</strong></div>`;
      } else if(r.template==='guarantee') { const after=f.beforeA-f.removed+f.added;if(after<0)throw Error('Removed credit exceeds the available credit.');result=M.cost(r,1,f.beforeA,after);breakdown=`<div><small>Credit before → after</small><strong>${f.beforeA} → ${after} h</strong></div><div><small>Pay before → after</small><strong>${money(M.pay(f.beforeA,r))} → ${money(M.pay(after,r))}</strong></div>`;
      } else { if(r.template==='fixed' && ![0,1].includes(f.quantity)) throw Error('A fixed-event test requires 0 or 1 qualifying event.'); result=M.cost(r,f.quantity,r.template==='bands'?f.delayBefore:0,r.template==='bands'?f.delayAfter:f.quantity); }
      target.innerHTML=`<div class="result">${breakdown}<div><small>${r.template==='standby'?`Incremental cash · GH ${r.ghPolicy}`:'Incremental cost'}</small><strong>${money(result)}</strong></div></div>`;
    }catch(e){target.innerHTML=`<div class="error">${esc(e.message)}</div>`;}
  };
  const readFields = (container, original) => {
    const result=structuredClone(original);
    container.querySelectorAll('[data-field]').forEach(el=>{if(!el.checkValidity())throw Error(`Check ${el.closest('label').textContent.trim()}.`);if(el.type==='number' && el.value==='') {if(el.dataset.field!=='rate')throw Error('Numeric parameters cannot be empty.');result[el.dataset.field]=null;}else result[el.dataset.field]=el.type==='number'?Number(el.value):el.value;});
    return result;
  };
  const saveParams = r => {
    const container=document.querySelector(`[data-detail="${key(r)}"] .parameters`), draft=readFields(container,r);
    container.querySelectorAll('[data-tier]').forEach(el=>{if(el.value===''||!el.checkValidity())throw Error('Check tier values.');draft.tiers[Number(el.dataset.tier)][el.dataset.part]=Number(el.value);});
    const state=M.defaults();state.rates[state.rates.findIndex(x=>x.id===r.id)]=draft;M.validate(state);Object.assign(r,draft,{updated:'Ryan'});
  };
  const modal = (title,body,save) => {document.querySelector('#dialog-title').textContent=title;document.querySelector('#dialog-body').innerHTML=body;dialogSave=save;document.querySelector('#dialog').showModal();};
  const setFields = s => `<label>Set name<input name="name" required maxlength="80" value="${esc(s.name)}"></label><label>Description<input name="description" maxlength="160" value="${esc(s.description)}"></label><label><input type="checkbox" name="enabled" ${s.enabled?'checked':''}> Enabled</label>`;
  const clone = r => {const copy=structuredClone(r);copy.instance=Math.max(...records.filter(x=>x.type===r.type).map(x=>x.instance))+1;copy.updated='Ryan';records.push(copy);return copy;};
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-action]');if(!b)return;const action=b.dataset.action,id=b.dataset.key,r=get(id),s=currentSet();
    try {
      if(action==='nav'){if(id.startsWith('Rule')){modal(id,'<p>The existing rule screens are unchanged. This standalone preview contains the new cost screens only.</p>',()=>{});return;}view=id;selectedCost='';}
      if(action==='filter'){selectedCost=id;if(id)expanded.add(id);}
      if(action==='category'){collapsed.has(id)?collapsed.delete(id):collapsed.add(id);}
      if(action==='select-set'){selectedSet=Number(id);selectedCost='';}
      if(action==='expand'){expanded.has(id)?expanded.delete(id):expanded.add(id);}
      if(action==='expand-all'){records.forEach(x=>expanded.add(key(x)));}
      if(action==='save-params'){saveParams(r);note('Parameters saved in this prototype session');}
      if(action==='calculate'){saveParams(r);r.fixture=readFields(document.querySelector(`[data-detail="${id}"] .fixture`),r.fixture);render();return;}
      if(action==='add-tier'){saveParams(r);if(r.tiers.length>=20)throw Error('Maximum 20 tiers.');const last=r.tiers.at(-1);last.upTo=(r.tiers.length>1?r.tiers.at(-2).upTo:r.guarantee)+5;r.tiers.push({upTo:null,multiplier:last.multiplier});}
      if(action==='delete-tier'){const [costId,i]=id.split(':');const cost=get(costId);saveParams(cost);if(cost.tiers.length===1)throw Error('At least one tier is required.');cost.tiers.splice(Number(i),1);cost.tiers.at(-1).upTo=null;}
      if(action==='copy'){const copy=clone(r);sets.find(x=>x.id===1)?.members.push(key(copy));if(s&&s.id!==1)s.members.push(key(copy));note(`Created ${key(copy)}`);}
      if(action==='new-set'||action==='edit-set'){const initial=action==='new-set'?{name:'',description:'',enabled:true}:s;modal(action==='new-set'?'Create cost set':'Edit cost set',setFields(initial),fd=>{const data={name:String(fd.get('name')).trim(),description:String(fd.get('description')),enabled:fd.has('enabled')};if(!data.name)throw Error('Set name is required.');if(action==='new-set'){const next=Math.max(0,...sets.map(x=>x.id))+1;sets.push({...data,id:next,members:records.map(key)});selectedSet=next;}else Object.assign(s,data);});return;}
      if(action==='copy-set'){modal('Copy cost set',`<label>New set name<input name="name" required value="${esc(s.name)} copy"></label><label>Cost instances<select name="mode"><option value="shared">Use existing instances</option><option value="new">Create independent copies</option></select></label>`,fd=>{const next=Math.max(...sets.map(x=>x.id))+1;const members=fd.get('mode')==='new'?s.members.map(k=>key(clone(get(k)))):[...s.members];if(fd.get('mode')==='new'){const mapping=new Map(s.members.map((k,i)=>[k,members[i]]));members.forEach(k=>{const item=get(k);if(item.template==='standby')item.ghPolicy=mapping.get(item.ghPolicy)||item.ghPolicy;});}sets.push({...s,id:next,name:String(fd.get('name')),members});const all=sets.find(x=>x.id===1);if(all)all.members=[...new Set([...all.members,...members])];selectedSet=next;});return;}
      if(action==='delete-set'){modal('Delete cost set',`<p>Delete ${esc(s.name)}? Cost instances will remain in the catalogue.</p>`,()=>{sets=sets.filter(x=>x.id!==s.id);selectedSet=sets[0]?.id;});return;}
      if(action==='members'){modal('Manage cost set membership',records.map(x=>`<label><input type="checkbox" name="member" value="${key(x)}" ${s.members.includes(key(x))?'checked':''}> <span class="id">${key(x)}</span>${esc(x.name)}</label>`).join(''),fd=>{s.members=fd.getAll('member');});return;}
      if(action==='meta'){modal(`Cost ${id}`,`<label>Description<input name="name" required value="${esc(r.name)}"></label><label>Reference<input name="source" value="${esc(r.source)}"></label><label><input name="enabled" type="checkbox" ${r.enabled?'checked':''}> Enabled</label>${r.instance!==1?button('delete-instance','Minus','Delete cost instance',id,'Delete instance'):'<p class="subtitle">Template 001 is protected from deletion.</p>'}`,fd=>Object.assign(r,{name:String(fd.get('name')),source:String(fd.get('source')),enabled:fd.has('enabled'),updated:'Ryan'}));return;}
      if(action==='delete-instance'){if(r.instance===1)throw Error('Templates cannot be deleted.');if(sets.some(x=>x.members.includes(id)))throw Error('Remove this instance from all sets before deleting it.');if(records.some(x=>x.template==='standby'&&x.ghPolicy===id))throw Error('A standby cost references this GH policy. Change that reference before deletion.');records.splice(records.indexOf(r),1);selectedCost='';document.querySelector('#dialog').close();}
      if(action==='close'){document.querySelector('#dialog').close();return;}
      if(action==='recalculate'){document.querySelectorAll('[data-detail]').forEach(el=>{const item=get(el.dataset.detail);saveParams(item);item.fixture=readFields(el.querySelector('.fixture'),item.fixture);});render();note('Expanded workbenches recalculated');return;}
      render();
    }catch(error){note(error.message);}
  });
  document.querySelector('#form').addEventListener('submit',e=>{e.preventDefault();try{dialogSave(new FormData(e.target));document.querySelector('#dialog').close();render();}catch(error){note(error.message);}});
  document.querySelector('#tree-search').addEventListener('input',e=>{search=e.target.value;render();});
  document.querySelector('#set-search').addEventListener('input',e=>{setSearch=e.target.value;render();});
  records.forEach(r=>{if(r.template==='fixed')r.fixture.quantity=1;if(r.template==='guarantee')r.fixture.added=6.75;});
  render();
})();
