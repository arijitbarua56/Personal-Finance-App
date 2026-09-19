const STORAGE_KEY='personal-finance-pwa-v1';
const defaults={
  balances:{cheq:60,td:1869,rbc:0},
  transactions:[],
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
    s.budgets={...defaults.budgets,...(s.budgets||{})};
    s.fixed={...defaults.fixed,...(s.fixed||{})};
    s.settings={...defaults.settings,...(s.settings||{})};
    return s;
  }catch{return clone(defaults)}
}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}
function id(){return (crypto.randomUUID&&crypto.randomUUID())||String(Date.now())+Math.random()}

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
  renderDashboardBudgets(); renderBudgets(); renderFixed(); renderHistory(); renderDashboardTx(); renderSettings();
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
    state={...clone(defaults),...imported,settings:{...defaults.settings,...(imported.settings||{})},budgets:{...defaults.budgets,...(imported.budgets||{})},fixed:{...defaults.fixed,...(imported.fixed||{})}};
    save();populateCats();render();$('settingsStatus').textContent='Backup imported.';
  }catch{$('settingsStatus').textContent='Could not import that backup.'}
  e.target.value='';
});
$('clearBtn').addEventListener('click',()=>{
  if(!confirm('Reset all balances, budgets, and transactions to the original starting values?'))return;
  state=clone(defaults);save();populateCats();render();showPage('dashboard');
});

let deferredPrompt;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('installBtn').classList.remove('hide')});
$('installBtn').addEventListener('click',async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$('installBtn').classList.add('hide')});

if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
render();