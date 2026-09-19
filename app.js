const SUPABASE_URL="https://qjgkdgvisbysaqpkyiez.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_8zDWxgcXTyEjApLLEjv1nA_p90-U9YI";
const sb = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true }
}) : null;
let currentUser=null;
let syncTimer=null;
let cloudBusy=false;
let initialCloudResolved=false;

const STORAGE_KEY='personal-finance-pwa-v4-3';
const APP_VERSION='4.3';
const defaults={
  balances:{cheq:60,td:2490.30,rbc:0},
  transactions:[],
  plan:[
    {id:'p1',date:'2026-10-01',type:'income',desc:'Paycheck (estimated)',amount:840},
    {id:'p2',date:'2026-10-01',type:'expense',desc:'October rent',amount:600},
    {id:'p3',date:'2026-10-01',type:'expense',desc:'Food + transportation until Oct 15',amount:240},
    {id:'p4',date:'2026-10-15',type:'income',desc:'Paycheck (estimated)',amount:840},
    {id:'p5',date:'2026-10-15',type:'expense',desc:'Oct temporary obligation',amount:150},
    {id:'p6',date:'2026-10-15',type:'expense',desc:'Phone + subscriptions',amount:230},
    {id:'p7',date:'2026-10-15',type:'expense',desc:'Groceries + transportation',amount:240},
    {id:'p8',date:'2026-10-15',type:'income',desc:'Dad transfer (maximum)',amount:1000},
    {id:'p9',date:'2026-10-15',type:'rbcPayment',desc:'Clear RBC glasses balance',amount:234.50},
    {id:'p10',date:'2026-10-15',type:'tdPayment',desc:'TD payment from dad transfer',amount:600},
    {id:'p11',date:'2026-10-29',type:'income',desc:'Paycheck (estimated)',amount:840},
    {id:'p12',date:'2026-10-29',type:'expense',desc:'Reserve Nov 1 rent',amount:600},
    {id:'p13',date:'2026-10-29',type:'expense',desc:'Food + transportation until Nov 12',amount:240},
    {id:'p14',date:'2026-11-12',type:'income',desc:'Paycheck (estimated)',amount:840},
    {id:'p15',date:'2026-11-12',type:'tdPayment',desc:'Planned TD payment',amount:300},
    {id:'p16',date:'2026-11-26',type:'income',desc:'Paycheck (estimated)',amount:840},
    {id:'p17',date:'2026-11-26',type:'expense',desc:'Reserve Dec 1 rent',amount:600},
    {id:'p18',date:'2026-12-10',type:'income',desc:'Paycheck (estimated)',amount:840},
    {id:'p19',date:'2026-12-10',type:'tdPayment',desc:'Push TD toward $300 or less',amount:300},
    {id:'p20',date:'2026-12-24',type:'income',desc:'Paycheck (estimated)',amount:840},
    {id:'p21',date:'2026-12-24',type:'expense',desc:'Reserve Jan 1 rent',amount:600}
  ],
  budgets:{Groceries:275,Transportation:330,'Eating Out':40,'Shopping / Personal':40,'Friend Repayment':75},
  fixed:{Rent:600,Phone:160,iCloud:12.99,'ChatGPT Plus':30,'YouTube Premium':14,'Amazon Prime + No Ads':15,'Temporary Obligation':150},
  settings:{tdIdeal:2000,tdHard:2100,cheqMin:100,cheqPreferred:200}
};
let state=loadAndMigrate();
let addMode='normal';
const $=id=>document.getElementById(id);
const money=n=>'$'+Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const todayStr=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const monthKey=d=>(d||todayStr()).slice(0,7);

function clone(x){return JSON.parse(JSON.stringify(x))}
function loadAndMigrate(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(!raw) return clone(defaults);
    const s=JSON.parse(raw);
    s.balances={...defaults.balances,...(s.balances||{})};
    s.transactions=Array.isArray(s.transactions)?s.transactions:[];
    s.plan=Array.isArray(s.plan)?s.plan:clone(defaults.plan);
    s.budgets={...defaults.budgets,...(s.budgets||{})};
    s.fixed={...defaults.fixed,...(s.fixed||{})};
    s.settings={...defaults.settings,...(s.settings||{})};
    return s;
  }catch{return clone(defaults)}
}
function save(options={sync:true}){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  if(options.sync) scheduleCloudSync();
}
function id(){return (crypto.randomUUID&&crypto.randomUUID())||String(Date.now())+Math.random()}


function setCloudUI(kind,text){
  const badge=$('cloudBadge');
  if(!badge) return;
  badge.textContent=text;
  badge.classList.remove('cloud-ok','cloud-warn','cloud-off');
  badge.classList.add(kind==='ok'?'cloud-ok':kind==='warn'?'cloud-warn':'cloud-off');
}
function setCloudMessage(text){ if($('cloudStatus')) $('cloudStatus').textContent=text||''; }
function scheduleCloudSync(){
  if(!currentUser || !sb || !initialCloudResolved) return;
  clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>uploadStateToCloud(false),700);
}
async function getCloudRow(){
  if(!currentUser||!sb) return {data:null,error:null};
  return await sb.from('finance_state').select('data,updated_at').eq('user_id',currentUser.id).maybeSingle();
}
async function uploadStateToCloud(showMessage=true){
  if(!currentUser||!sb||cloudBusy) return;
  cloudBusy=true; setCloudUI('warn','Syncing…'); if($('syncStatus')) $('syncStatus').textContent='Syncing…';
  try{
    const payload={...state,_cloudMeta:{version:APP_VERSION,syncedFrom:'money-tracker-v4.3',syncedAt:new Date().toISOString()}};
    const {error}=await sb.from('finance_state').upsert({user_id:currentUser.id,data:payload,updated_at:new Date().toISOString()},{onConflict:'user_id'});
    if(error) throw error;
    setCloudUI('ok','Synced'); if($('syncStatus')) $('syncStatus').textContent='Synced';
    if(showMessage) setCloudMessage('This device was uploaded to the cloud.');
  }catch(e){
    console.error(e); setCloudUI('off','Sync error'); if($('syncStatus')) $('syncStatus').textContent='Error';
    if(showMessage) setCloudMessage('Sync failed: '+(e.message||'Unknown error'));
  }finally{cloudBusy=false}
}
function sanitizeCloudState(raw){
  if(!raw || typeof raw!=='object') return null;
  return {
    ...clone(defaults),
    ...raw,
    balances:{...defaults.balances,...(raw.balances||{})},
    transactions:Array.isArray(raw.transactions)?raw.transactions:[],
    plan:Array.isArray(raw.plan)?raw.plan:clone(defaults.plan),
    budgets:{...defaults.budgets,...(raw.budgets||{})},
    fixed:{...defaults.fixed,...(raw.fixed||{})},
    settings:{...defaults.settings,...(raw.settings||{})}
  };
}
async function downloadStateFromCloud(showMessage=true){
  if(!currentUser||!sb) return;
  cloudBusy=true; setCloudUI('warn','Downloading…');
  try{
    const {data,error}=await getCloudRow();
    if(error) throw error;
    if(!data){
      if(showMessage) setCloudMessage('No cloud data exists yet.');
      return false;
    }
    const cleaned=sanitizeCloudState(data.data);
    if(!cleaned) throw new Error('Cloud data is invalid.');
    state=cleaned;
    localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    populateCats(); render();
initCloud();
    setCloudUI('ok','Synced'); if($('syncStatus')) $('syncStatus').textContent='Synced';
    if(showMessage) setCloudMessage('Cloud data downloaded to this device.');
    return true;
  }catch(e){
    console.error(e); setCloudUI('off','Sync error');
    if(showMessage) setCloudMessage('Download failed: '+(e.message||'Unknown error'));
    return false;
  }finally{cloudBusy=false}
}

async function refreshFromCloudIfSignedIn(){
  if(!currentUser||!sb||cloudBusy) return;
  try{
    const {data,error}=await getCloudRow();
    if(error||!data) return;
    const cloudState=sanitizeCloudState(data.data);
    if(!cloudState) return;
    const localJSON=JSON.stringify({...state,_cloudMeta:undefined});
    const cloudJSON=JSON.stringify({...cloudState,_cloudMeta:undefined});
    if(localJSON!==cloudJSON){
      state=cloudState;
      localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
      populateCats(); render();
      setCloudUI('ok','Synced');
      if($('syncStatus')) $('syncStatus').textContent='Synced';
      setCloudMessage('Updated from cloud.');
    }
  }catch(e){
    console.error(e);
  }
}

function localLooksMeaningful(){
  const d=defaults;
  if(state.transactions?.length) return true;
  if(JSON.stringify(state.balances)!==JSON.stringify(d.balances)) return true;
  if(JSON.stringify(state.budgets)!==JSON.stringify(d.budgets)) return true;
  if(JSON.stringify(state.fixed)!==JSON.stringify(d.fixed)) return true;
  if(JSON.stringify(state.plan)!==JSON.stringify(d.plan)) return true;
  return false;
}
async function resolveInitialCloud(){
  if(!currentUser||!sb) return;
  setCloudUI('warn','Checking cloud…');
  try{
    const {data,error}=await getCloudRow();
    if(error) throw error;
    if(!data){
      initialCloudResolved=true;
      await uploadStateToCloud(false);
      setCloudMessage('Cloud was empty, so this device became the first synced copy.');
      setCloudUI('ok','Synced');
    }else{
      const cloudState=sanitizeCloudState(data.data);
      state=cloudState;
      localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
      populateCats(); render();
      initialCloudResolved=true;
      setCloudUI('ok','Synced');
      if($('syncStatus')) $('syncStatus').textContent='Synced';
      setCloudMessage('Cloud data loaded on this device.');
    }
  }catch(e){
    console.error(e);
    setCloudUI('off','Sync error');
    setCloudMessage('Could not connect to cloud: '+(e.message||'Unknown error'));
  }finally{
    initialCloudResolved=true;
  }
}
function renderAuth(){
  const signedIn=!!currentUser;
  if($('signedOutCloud')) $('signedOutCloud').classList.toggle('hide',signedIn);
  if($('signedInCloud')) $('signedInCloud').classList.toggle('hide',!signedIn);
  if(signedIn && $('userEmail')) $('userEmail').textContent=currentUser.email||'Signed-in user';
  if(signedIn && $('authPassword')) $('authPassword').value='';
  if(!signedIn) setCloudUI(navigator.onLine?'warn':'off',navigator.onLine?'Not signed in':'Offline');
}
async function initCloud(){
  if(!sb){setCloudUI('off','Cloud unavailable');return}
  const {data:{session},error:sessionError}=await sb.auth.getSession();
  if(sessionError){ console.error(sessionError); currentUser=null; }
  else currentUser=session?.user||null;
  renderAuth();
  if(currentUser) await resolveInitialCloud();
  sb.auth.onAuthStateChange(async(event,session)=>{
    const previous=currentUser?.id; currentUser=session?.user||null; renderAuth();
    if(currentUser && currentUser.id!==previous){initialCloudResolved=false; await resolveInitialCloud();}
    if(!currentUser){initialCloudResolved=false;setCloudMessage('');}
  });
}

function apply(t,dir=1){
  if(t.type==='cardPayment'){
    const cardKey=t.account==='TD Credit Card'?'td':'rbc';
    state.balances[cardKey]-=t.amount*dir;
    state.balances.cheq-=t.amount*dir;
    return;
  }
  const key=t.account==='Chequing'?'cheq':t.account==='TD Credit Card'?'td':'rbc';
  let impact=0;
  if(t.type==='spend') impact=key==='cheq'?-t.amount:t.amount;
  else if(t.type==='payment') impact=-t.amount;
  else if(t.type==='income') impact=key==='cheq'?t.amount:-t.amount;
  state.balances[key]+=impact*dir;
}

function spendFor(cat,mk=monthKey(todayStr())){
  return state.transactions.filter(t=>t.category===cat&&t.type==='spend'&&monthKey(t.date)===mk).reduce((s,t)=>s+t.amount,0);
}
function currentMonthSpent(){return Object.keys(state.budgets).reduce((s,c)=>s+spendFor(c),0)}

function render(){
  const {cheq,td,rbc}=state.balances;
  $('cheqBal').textContent=money(cheq); $('tdBal').textContent=money(td); $('rbcBal').textContent=money(rbc); $('debtBal').textContent=money(td+rbc);
  $('tdBal').className='value '+(td>state.settings.tdHard?'bad':td>state.settings.tdIdeal?'warn':'good');
  $('cheqBal').className='value '+(cheq<state.settings.cheqMin?'bad':cheq<state.settings.cheqPreferred?'warn':'good');
  const msgs=[
    td>state.settings.tdHard?`TD is over your ${money(state.settings.tdHard)} hard limit.`:td>state.settings.tdIdeal?`TD is above your ${money(state.settings.tdIdeal)} ideal target.`:'TD is within your ideal target.',
    cheq<state.settings.cheqMin?`Chequing is below your ${money(state.settings.cheqMin)} minimum.`:cheq<state.settings.cheqPreferred?`Chequing is below your preferred ${money(state.settings.cheqPreferred)} buffer.`:'Chequing buffer is healthy.'
  ];
  $('guardStatus').textContent=msgs.join(' ');
  renderDashboardBudgets(); renderBudgets(); renderFixed(); renderHistory(); renderDashboardTx(); renderSettings(); renderPlan();
}

function renderDashboardBudgets(){
  const wrap=$('dashboardBudgets'); wrap.innerHTML='';
  for(const cat of ['Groceries','Transportation']){
    const target=state.budgets[cat]||0, used=spendFor(cat), remain=target-used, pct=target?Math.min(100,Math.max(0,used/target*100)):0;
    const d=document.createElement('div'); d.className='budget';
    d.innerHTML=`<div class="budget-head"><span>${cat}</span><span>${money(used)} / ${money(target)}</span></div><div class="bar"><div class="fill" style="width:${pct}%"></div></div><div class="smalltxt ${remain<0?'bad':''}">${remain>=0?money(remain)+' remaining':money(Math.abs(remain))+' over target'}</div>`;
    wrap.appendChild(d);
  }
}

function renderBudgets(){
  const wrap=$('budgets'); wrap.innerHTML='';
  let targetTotal=0;
  for(const [cat,target] of Object.entries(state.budgets)){
    targetTotal+=Number(target)||0;
    const used=spendFor(cat), remain=target-used, pct=target?Math.min(100,Math.max(0,used/target*100)):0;
    const d=document.createElement('div'); d.className='budget';
    d.innerHTML=`<div class="budget-head"><span>${cat}</span><span>${money(used)} / ${money(target)}</span></div><div class="bar"><div class="fill" style="width:${pct}%"></div></div><div class="smalltxt ${remain<0?'bad':''}">${remain>=0?money(remain)+' remaining':money(Math.abs(remain))+' over target'}</div>`;
    wrap.appendChild(d);
  }
  $('budgetTargetTotal').textContent=money(targetTotal);
  $('budgetSpentTotal').textContent=money(currentMonthSpent());
}

function renderFixed(){
  const wrap=$('fixedCosts'); wrap.innerHTML='';
  for(const [k,v] of Object.entries(state.fixed)){
    const d=document.createElement('div');d.className='list-card';d.innerHTML=`<div class="list-name">${k}</div><div class="list-val">${money(v)}</div>`;wrap.appendChild(d);
  }
}

function txHtml(t){
  let meta=`${t.date} · ${t.account} · ${t.category||'Other'}`;
  if(t.type==='cardPayment') meta=`${t.date} · Chequing → ${t.account}`;
  return `<div class="tx-main"><div class="tx-title">${escapeHtml(t.desc||t.category||'Transaction')}</div><div class="tx-meta">${escapeHtml(meta)}</div></div><div class="amount">${money(t.amount)}</div>`;
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function renderDashboardTx(){
  const wrap=$('dashboardTx'); wrap.innerHTML='';
  const arr=state.transactions.slice().reverse().slice(0,5);
  if(!arr.length){wrap.innerHTML='<div class="sub">No transactions yet.</div>';return}
  arr.forEach(t=>{const d=document.createElement('div');d.className='tx';d.innerHTML=txHtml(t);wrap.appendChild(d)});
}
function renderHistory(){
  const wrap=$('txList'); wrap.innerHTML='';
  const af=$('historyAccount').value, cf=$('historyCategory').value;
  const arr=state.transactions.filter(t=>(!af||t.account===af)&&(!cf||t.category===cf)).slice().reverse();
  if(!arr.length){wrap.innerHTML='<div class="sub">No matching transactions.</div>';return}
  arr.forEach(t=>{const d=document.createElement('div');d.className='tx';d.innerHTML=txHtml(t);wrap.appendChild(d)});
}
function renderSettings(){
  $('setCheq').value=state.balances.cheq.toFixed(2); $('setTd').value=state.balances.td.toFixed(2); $('setRbc').value=state.balances.rbc.toFixed(2);
  $('setTdIdeal').value=state.settings.tdIdeal; $('setTdHard').value=state.settings.tdHard; $('setCheqMin').value=state.settings.cheqMin;
}


function planKindLabel(type){
  return ({income:'Income',expense:'Expense / reserve',tdPayment:'TD payment',rbcPayment:'RBC payment',tdPurchase:'TD purchase',rbcPurchase:'RBC purchase'})[type]||type;
}
function projectedBalances(){
  let cheq=Number(state.balances.cheq)||0, td=Number(state.balances.td)||0, rbc=Number(state.balances.rbc)||0;
  const sorted=state.plan.slice().sort((a,b)=>a.date.localeCompare(b.date));
  for(const p of sorted){
    const a=Number(p.amount)||0;
    if(p.type==='income') cheq+=a;
    else if(p.type==='expense') cheq-=a;
    else if(p.type==='tdPayment'){cheq-=a;td-=a;}
    else if(p.type==='rbcPayment'){cheq-=a;rbc-=a;}
    else if(p.type==='tdPurchase') td+=a;
    else if(p.type==='rbcPurchase') rbc+=a;
  }
  return {cheq,td,rbc};
}
function renderPlan(){
  const wrap=$('planList'); if(!wrap) return;
  wrap.innerHTML='';
  const sorted=state.plan.slice().sort((a,b)=>a.date.localeCompare(b.date));
  if(!sorted.length){wrap.innerHTML='<div class="sub">No future items planned.</div>';}
  sorted.forEach(p=>{
    const d=document.createElement('div'); d.className='plan-item';
    const amtClass=p.type==='income'?'good':(p.type==='tdPayment'||p.type==='rbcPayment')?'good':'';
    d.innerHTML=`<div class="plan-date">${p.date}</div><button type="button" data-plan-id="${escapeHtml(p.id)}"><div class="plan-desc">${escapeHtml(p.desc)}</div><div class="plan-kind">${escapeHtml(planKindLabel(p.type))}</div></button><div class="plan-amt ${amtClass}">${p.type==='income'?'+':'−'}${money(p.amount)}</div>`;
    d.querySelector('button').addEventListener('click',()=>openPlanModal(p.id));
    wrap.appendChild(d);
  });
  const proj=projectedBalances();
  $('planCheq').textContent=money(proj.cheq);
  $('planCheq').className='value '+(proj.cheq<state.settings.cheqMin?'bad':proj.cheq<state.settings.cheqPreferred?'warn':'good');
  $('planDebt').textContent=money(Math.max(0,proj.td)+Math.max(0,proj.rbc));

  const ms=$('milestones'); ms.innerHTML='';
  const milestones=[
    ['Oct 1','Rent paid; survive to Oct 15 without adding unnecessary debt.'],
    ['Mid-Oct','Dad transfer arrives: clear RBC glasses charge, keep a cash buffer, then make a large TD payment.'],
    ['Oct 29','Set aside the Nov 1 rent immediately.'],
    ['End Nov','Aim to have TD around $400–$600 or lower, depending on actual take-home and taxis.'],
    ['End Dec','Goal: TD under $300 or fully paid, without draining chequing to $0.']
  ];
  milestones.forEach(([date,text])=>{const d=document.createElement('div');d.className='milestone';d.innerHTML=`<div class="milestone-date">${date}</div><div class="milestone-text">${text}</div>`;ms.appendChild(d)});
}
function openPlanModal(planId=''){
  const p=state.plan.find(x=>x.id===planId);
  $('editPlanId').value=p?p.id:'';
  $('planModalTitle').textContent=p?'Edit planned item':'Add planned item';
  $('planDate').value=p?p.date:todayStr();
  $('planType').value=p?p.type:'expense';
  $('planDesc').value=p?p.desc:'';
  $('planAmount').value=p?p.amount:'';
  $('deletePlanBtn').classList.toggle('hide',!p);
  $('planModal').classList.remove('hide');
}

function showPage(name){
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===`page-${name}`));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.page===name));
  window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));

const allCats=()=>[...new Set([...Object.keys(state.fixed),...Object.keys(state.budgets),'Glasses','Other'])];
function populateCats(){
  const cat=$('category'), hc=$('historyCategory'); cat.innerHTML=''; hc.innerHTML='<option value="">All categories</option>';
  allCats().forEach(c=>{const o=document.createElement('option');o.textContent=c;cat.appendChild(o);const h=document.createElement('option');h.textContent=c;hc.appendChild(h)});
}
populateCats();
$('date').value=todayStr(); $('paymentDate').value=todayStr();

function setAddMode(mode){
  addMode=mode;
  $('normalFields').classList.toggle('hide',mode==='payment');
  $('paymentFields').classList.toggle('hide',mode!=='payment');
  $('modePurchase').classList.toggle('active',mode==='normal');
  $('modePayment').classList.toggle('active',mode==='payment');
  $('desc').placeholder=mode==='payment'?'Credit card payment':'Taxi to work';
}
$('modePurchase').addEventListener('click',()=>setAddMode('normal'));
$('modePayment').addEventListener('click',()=>setAddMode('payment'));

$('txForm').addEventListener('submit',e=>{
  e.preventDefault();
  const amount=parseFloat($('amount').value);
  if(!Number.isFinite(amount)||amount<=0){$('status').textContent='Enter a valid amount.';return}
  let t;
  if(addMode==='payment'){
    if(state.balances.cheq<amount && !confirm(`This payment is larger than your current chequing balance (${money(state.balances.cheq)}). Save it anyway?`)) return;
    t={id:id(),date:$('paymentDate').value||todayStr(),account:$('paymentCard').value,category:'Credit Card Payment',type:'cardPayment',amount,desc:$('desc').value.trim()||'Credit card payment'};
  }else{
    t={id:id(),date:$('date').value||todayStr(),account:$('account').value,category:$('category').value,type:$('type').value,amount,desc:$('desc').value.trim()};
  }
  apply(t); state.transactions.push(t); save();
  $('amount').value=''; $('desc').value=''; $('status').textContent='Saved.';
  render(); showPage('dashboard');
});

$('undoBtn').addEventListener('click',()=>{
  const t=state.transactions.pop(); if(!t){$('status').textContent='Nothing to undo.';return}
  apply(t,-1); save(); $('status').textContent='Last transaction undone.'; render();
});

document.querySelectorAll('.quick-add').forEach(b=>b.addEventListener('click',()=>{
  setAddMode('normal'); $('date').value=todayStr(); $('category').value=b.dataset.cat; $('desc').value=b.dataset.desc; $('type').value='spend';
  showPage('add'); setTimeout(()=>$('amount').focus(),100);
}));

$('historyAccount').addEventListener('change',renderHistory); $('historyCategory').addEventListener('change',renderHistory);

$('saveSettingsBtn').addEventListener('click',()=>{
  const vals={
    cheq:parseFloat($('setCheq').value),td:parseFloat($('setTd').value),rbc:parseFloat($('setRbc').value),
    tdIdeal:parseFloat($('setTdIdeal').value),tdHard:parseFloat($('setTdHard').value),cheqMin:parseFloat($('setCheqMin').value)
  };
  if(Object.values(vals).some(v=>!Number.isFinite(v))){$('settingsStatus').textContent='Please enter valid numbers.';return}
  state.balances={cheq:vals.cheq,td:vals.td,rbc:vals.rbc};
  state.settings={...state.settings,tdIdeal:vals.tdIdeal,tdHard:vals.tdHard,cheqMin:vals.cheqMin};
  save(); $('settingsStatus').textContent='Saved.'; render();
});

function openBudgetEditor(){
  const wrap=$('budgetEditor');wrap.innerHTML='';
  const addGroup=(title,obj,prefix)=>{
    const h=document.createElement('h4');h.textContent=title;h.style.margin='14px 0 8px';wrap.appendChild(h);
    for(const [k,v] of Object.entries(obj)){
      const l=document.createElement('label');l.textContent=k;
      const i=document.createElement('input');i.type='number';i.step='0.01';i.value=v;i.dataset.group=prefix;i.dataset.key=k;l.appendChild(i);wrap.appendChild(l);
    }
  };
  addGroup('Variable targets',state.budgets,'budgets'); addGroup('Fixed costs',state.fixed,'fixed');
  $('budgetModal').classList.remove('hide');
}

$('addPlanBtn').addEventListener('click',()=>openPlanModal());
$('closePlanBtn').addEventListener('click',()=>$('planModal').classList.add('hide'));
$('savePlanBtn').addEventListener('click',()=>{
  const amount=parseFloat($('planAmount').value), date=$('planDate').value, desc=$('planDesc').value.trim();
  if(!date||!Number.isFinite(amount)||amount<=0||!desc){alert('Enter a date, description, and valid amount.');return}
  const editId=$('editPlanId').value;
  const item={id:editId||id(),date,type:$('planType').value,desc,amount};
  if(editId){
    const idx=state.plan.findIndex(x=>x.id===editId);
    if(idx>=0) state.plan[idx]=item;
  }else state.plan.push(item);
  save();$('planModal').classList.add('hide');render();
});
$('deletePlanBtn').addEventListener('click',()=>{
  const editId=$('editPlanId').value;if(!editId)return;
  if(!confirm('Delete this planned item?'))return;
  state.plan=state.plan.filter(x=>x.id!==editId);save();$('planModal').classList.add('hide');render();
});

$('editBudgetBtn').addEventListener('click',openBudgetEditor);
$('closeBudgetBtn').addEventListener('click',()=>$('budgetModal').classList.add('hide'));
$('saveBudgetBtn').addEventListener('click',()=>{
  $('budgetEditor').querySelectorAll('input').forEach(i=>{const v=parseFloat(i.value);if(Number.isFinite(v)&&v>=0)state[i.dataset.group][i.dataset.key]=v});
  save();$('budgetModal').classList.add('hide');render();
});

$('exportBtn').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`money-tracker-backup-${todayStr()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);
});
$('importBtn').addEventListener('click',()=>$('importInput').click());
$('importInput').addEventListener('change',async e=>{
  const f=e.target.files[0];if(!f)return;
  try{
    const imported=JSON.parse(await f.text());
    if(!imported.balances||!Array.isArray(imported.transactions))throw new Error();
    state={...clone(defaults),...imported,settings:{...defaults.settings,...(imported.settings||{})},budgets:{...defaults.budgets,...(imported.budgets||{})},fixed:{...defaults.fixed,...(imported.fixed||{})},plan:Array.isArray(imported.plan)?imported.plan:clone(defaults.plan)};
    save();populateCats();render();$('settingsStatus').textContent='Backup imported.';
  }catch{$('settingsStatus').textContent='Could not import that backup.'}
  e.target.value='';
});
$('clearBtn').addEventListener('click',()=>{
  if(!confirm('Reset all balances, budgets, and transactions to the original starting values?'))return;
  state=clone(defaults);save();populateCats();render();showPage('dashboard');
});


$('signInPasswordBtn').addEventListener('click',async()=>{
  const email=$('authEmail').value.trim();
  const password=$('authPassword').value;
  if(!email||!password){$('authStatus').textContent='Enter your email and password.';return}
  $('authStatus').textContent='Signing in…';
  const {error}=await sb.auth.signInWithPassword({email,password});
  $('authStatus').textContent=error?('Sign-in failed: '+error.message):'Signed in.';
});
$('createAccountBtn').addEventListener('click',async()=>{
  const email=$('authEmail').value.trim();
  const password=$('authPassword').value;
  if(!email||!password){$('authStatus').textContent='Enter your email and password.';return}
  if(password.length<6){$('authStatus').textContent='Use a password with at least 6 characters.';return}
  $('authStatus').textContent='Creating account…';
  const {data,error}=await sb.auth.signUp({email,password});
  if(error){$('authStatus').textContent='Could not create account: '+error.message;return}
  if(data?.session){
    $('authStatus').textContent='Account created and signed in.';
  }else{
    $('authStatus').textContent='Account created. If email confirmation is enabled in Supabase, confirm the email once, then use password sign-in.';
  }
});
$('sendMagicLinkBtn').addEventListener('click',async()=>{
  const email=$('authEmail').value.trim();
  if(!email){$('authStatus').textContent='Enter your email.';return}
  $('authStatus').textContent='Sending…';
  const redirectTo=location.origin+location.pathname;
  const {error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:redirectTo}});
  $('authStatus').textContent=error?('Could not send link: '+error.message):'Check your email and tap the sign-in link.';
});
$('syncNowBtn').addEventListener('click',async()=>{await uploadStateToCloud(true)});
$('uploadLocalBtn').addEventListener('click',async()=>{
  if(!confirm('Replace the cloud copy with the data currently on this device?')) return;
  initialCloudResolved=true; await uploadStateToCloud(true);
});
$('downloadCloudBtn').addEventListener('click',async()=>{
  if(!confirm('Replace this device’s local copy with the cloud copy?')) return;
  await downloadStateFromCloud(true);
});
$('signOutBtn').addEventListener('click',async()=>{await sb.auth.signOut();currentUser=null;renderAuth()});
window.addEventListener('online',()=>{if(currentUser){setCloudUI('warn','Back online');scheduleCloudSync()}else setCloudUI('warn','Not signed in')});
window.addEventListener('offline',()=>setCloudUI('off','Offline'));


window.addEventListener('focus',()=>{refreshFromCloudIfSignedIn()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible') refreshFromCloudIfSignedIn()});
setInterval(()=>{if(document.visibilityState==='visible') refreshFromCloudIfSignedIn()},20000);

let deferredPrompt;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('installBtn').classList.remove('hide')});
$('installBtn').addEventListener('click',async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$('installBtn').classList.add('hide')});

if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
render();
initCloud();
