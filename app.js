const SUPABASE_URL="https://qjgkdgvisbysaqpkyiez.supabase.co";
const SUPABASE_KEY="sb_publishable_8zDWxgcXTyEjApLLEjv1nA_p90-U9YI";
const STORAGE_KEY="money-tracker-v5";
const LEGACY_KEYS=["personal-finance-pwa-v4-3","personal-finance-pwa-v1"];
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});

const defaults={
 accounts:[
  {id:"td-cheq",name:"TD Chequing",type:"chequing",balance:60},
  {id:"rbc-cheq",name:"RBC Chequing",type:"chequing",balance:0},
  {id:"ws-cheq",name:"Wealthsimple Chequing",type:"chequing",balance:0},
  {id:"td-credit",name:"TD Credit Card",type:"credit",balance:2490.30,creditLimit:2500},
  {id:"rbc-credit",name:"RBC Credit Card",type:"credit",balance:0,creditLimit:0}
 ],
 categories:[
  {id:"groceries",name:"Groceries",emoji:"🛒",budget:275,quick:true,kind:"variable"},
  {id:"transport",name:"Transportation",emoji:"🚕",budget:330,quick:true,kind:"variable"},
  {id:"eating",name:"Eating Out",emoji:"🍔",budget:40,quick:true,kind:"variable"},
  {id:"rent",name:"Rent",emoji:"🏠",budget:600,quick:false,kind:"fixed"},
  {id:"phone",name:"Phone",emoji:"📱",budget:160,quick:false,kind:"fixed"},
  {id:"icloud",name:"iCloud",emoji:"☁️",budget:12.99,quick:false,kind:"fixed"},
  {id:"chatgpt",name:"ChatGPT Plus",emoji:"✦",budget:30,quick:false,kind:"fixed"},
  {id:"youtube",name:"YouTube Premium",emoji:"▶️",budget:14,quick:false,kind:"fixed"},
  {id:"amazon",name:"Amazon Prime + No Ads",emoji:"📦",budget:15,quick:false,kind:"fixed"},
  {id:"temp-obligation",name:"Temporary Obligation",emoji:"📌",budget:150,quick:false,kind:"fixed"},
  {id:"shopping",name:"Shopping / Personal",emoji:"🛍️",budget:40,quick:false,kind:"variable"},
  {id:"friend",name:"Friend Repayment",emoji:"🤝",budget:75,quick:false,kind:"obligation"},
  {id:"other",name:"Other",emoji:"•",budget:0,quick:false,kind:"exclude"}
 ],
 transactions:[],
 settings:{utilTarget:35,biweeklyPay:850,nextPayDate:"2026-10-01",savingPerPay:25,trackingStartDate:"2026-09-18"},
 plan:[
  {id:"plan-1",date:"2026-10-01",type:"income",description:"Paycheck (estimate)",accountId:"td-cheq",amount:850},
  {id:"plan-2",date:"2026-10-01",type:"expense",description:"October rent",accountId:"td-cheq",amount:600},
  {id:"plan-3",date:"2026-10-15",type:"income",description:"Paycheck (estimate)",accountId:"td-cheq",amount:850},
  {id:"plan-4",date:"2026-10-15",type:"income",description:"Dad transfer",accountId:"td-cheq",amount:1000},
  {id:"plan-6",date:"2026-10-29",type:"income",description:"Paycheck (estimate)",accountId:"td-cheq",amount:850},
  {id:"plan-7",date:"2026-10-29",type:"expense",description:"Reserve November rent",accountId:"td-cheq",amount:600}
 ]
};

let state=loadState();
let user=null,syncing=false,syncTimer=null,cloudReady=false;
let selectedAccountId=state.accounts[0]?.id||"",selectedCategoryId=state.categories[0]?.id||"";
const $=id=>document.getElementById(id);
const money=n=>"$"+Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const today=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random();

function clone(x){return JSON.parse(JSON.stringify(x))}
function normalizeAccounts(list){
 const arr=Array.isArray(list)?list:[];
 return arr.map(a=>{
   if(a.id==="td-credit"&&(!Number(a.creditLimit)||Number(a.creditLimit)<=0)) return {...a,creditLimit:2500};
   return a;
 });
}
function migrateLegacy(raw){
 try{
  const s=JSON.parse(raw);
  if(Array.isArray(s.accounts)){ s.accounts=normalizeAccounts(s.accounts);
    if(!Array.isArray(s.plan)) s.plan=clone(defaults.plan);
    if(!s.settings)s.settings=clone(defaults.settings);
    s.settings={...clone(defaults.settings),...s.settings};
    if(!Array.isArray(s.categories))s.categories=clone(defaults.categories);
    const ids=new Set(s.categories.map(c=>c.id));defaults.categories.forEach(c=>{if(!ids.has(c.id))s.categories.push(clone(c))});
    s.categories=s.categories.map(c=>{const d=defaults.categories.find(x=>x.id===c.id);return {...(d||{}),...c,kind:c.kind||(d?.kind||"variable")}});
    return s;
  }
  if(s.balances){
   const n=clone(defaults);
   n.accounts.find(a=>a.id==="td-cheq").balance=Number(s.balances.cheq||60);
   n.accounts.find(a=>a.id==="td-credit").balance=Number(s.balances.td||2490.30);
   n.accounts.find(a=>a.id==="rbc-credit").balance=Number(s.balances.rbc||0);
   if(Array.isArray(s.transactions)){
    n.transactions=s.transactions.map(t=>({
      id:t.id||uid(),date:t.date||today(),
      accountId:t.account==="TD Credit Card"?"td-credit":t.account==="RBC Credit Card"?"rbc-credit":"td-cheq",
      categoryId:(n.categories.find(c=>c.name===t.category)||n.categories.find(c=>c.id==="other")).id,
      type:t.type==="income"?"income":t.type==="payment"?"credit":"spend",
      amount:Number(t.amount||0),note:t.desc||""
    }));
   }
   return n;
  }
 }catch(e){}
 return null;
}
function loadState(){
 const cur=localStorage.getItem(STORAGE_KEY);if(cur){try{return JSON.parse(cur)}catch(e){}}
 for(const k of LEGACY_KEYS){const v=localStorage.getItem(k);if(v){const m=migrateLegacy(v);if(m){localStorage.setItem(STORAGE_KEY,JSON.stringify(m));return m}}}
 const d=clone(defaults);d.accounts=normalizeAccounts(d.accounts);return d;
}
function save(localOnly=false){
 if(!Array.isArray(state.plan))state.plan=clone(defaults.plan);
 if(!state.settings)state.settings=clone(defaults.settings);
 state.settings={...clone(defaults.settings),...state.settings};state.accounts=normalizeAccounts(state.accounts);
 if(!Array.isArray(state.categories))state.categories=clone(defaults.categories);
 const ids=new Set(state.categories.map(c=>c.id));defaults.categories.forEach(c=>{if(!ids.has(c.id))state.categories.push(clone(c))});
 state.categories=state.categories.map(c=>{const d=defaults.categories.find(x=>x.id===c.id);return {...(d||{}),...c,kind:c.kind||(d?.kind||"variable")}});
 localStorage.setItem(STORAGE_KEY,JSON.stringify(state));render();if(!localOnly)scheduleSync()}
function account(id){return state.accounts.find(a=>a.id===id)}
function category(id){return state.categories.find(c=>c.id===id)}
function spendFor(catId){const ym=today().slice(0,7);return state.transactions.filter(t=>t.categoryId===catId&&t.type==="spend"&&t.date.startsWith(ym)).reduce((s,t)=>s+Number(t.amount),0)}
function totalMonthSpend(){return state.transactions.filter(t=>t.type==="spend"&&t.date.startsWith(today().slice(0,7))).reduce((s,t)=>s+Number(t.amount),0)}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}

function render(){if(!Array.isArray(state.plan))state.plan=clone(defaults.plan);renderAccounts();renderQuick();renderBudgets();renderHistory();renderRecent();renderChips();renderFilters();renderSettingsLists();renderPaymentSelects();renderPlan();renderDebtTrajectory();renderDebtTargetSettings();renderMonthlyDashboard();renderIncomeSettings();renderAuth()}

function daysInMonth(y,m){return new Date(y,m,0).getDate()}
function parseDateOnly(s){const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)}
function addDays(d,n){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()+n);return x}
function countPaydaysInMonth(year,monthIndex){
 const anchor=parseDateOnly(state.settings?.nextPayDate||"2026-10-01");
 let d=new Date(anchor),end=new Date(year,monthIndex+1,0),start=new Date(year,monthIndex,1);
 while(d>end)d=addDays(d,-14);while(d<start)d=addDays(d,14);
 let count=0;while(d.getFullYear()===year&&d.getMonth()===monthIndex){count++;d=addDays(d,14)}return count;
}
function categoryTotal(kind){return state.categories.filter(c=>c.kind===kind).reduce((s,c)=>s+Math.max(0,Number(c.budget)||0),0)}
function fixedMonthlyTotal(){return categoryTotal("fixed")+categoryTotal("obligation")}
function variableTargetTotal(){return categoryTotal("variable")}
function monthSpentFor(year,monthIndex){const ym=year+"-"+String(monthIndex+1).padStart(2,"0");return state.transactions.filter(t=>t.type==="spend"&&String(t.date||"").startsWith(ym)).reduce((s,t)=>s+Number(t.amount||0),0)}
function cashOnHandNow(){return state.accounts.filter(a=>["chequing","savings","cash"].includes(a.type)).reduce((s,a)=>s+(Number(a.balance)||0),0)}
function totalCardDebtNow(){return state.accounts.filter(a=>a.type==="credit").reduce((s,a)=>s+Math.max(0,Number(a.balance)||0),0)}
function totalCreditLimitNow(){return state.accounts.filter(a=>a.type==="credit").reduce((s,a)=>s+Math.max(0,Number(a.creditLimit)||0),0)}
function debtTargetBalance(){return totalCreditLimitNow()*(Number(state.settings?.utilTarget??35)/100)}
function remainingToUtilTarget(){return Math.max(0,totalCardDebtNow()-debtTargetBalance())}
function nextPaydayOnOrAfter(date){
 const anchor=parseDateOnly(state.settings?.nextPayDate||"2026-10-01");
 let d=new Date(anchor);
 while(d<date)d=addDays(d,14);
 while(addDays(d,-14)>=date)d=addDays(d,-14);
 return d;
}
function remainingPaydaysInMonth(fromDate){
 const y=fromDate.getFullYear(),m=fromDate.getMonth(),end=new Date(y,m+1,0);
 let d=nextPaydayOnOrAfter(fromDate),count=0;
 while(d<=end){count++;d=addDays(d,14)}return count;
}
function plannedNonDebtExpensesBetween(start,end){
 return (state.plan||[]).filter(p=>p.type==="expense"&&parseDateOnly(p.date)>=start&&parseDateOnly(p.date)<end).reduce((s,p)=>s+Number(p.amount||0),0);
}
function regularMonthModel(year,monthIndex){
 const paydays=countPaydaysInMonth(year,monthIndex);
 const income=paydays*Number(state.settings?.biweeklyPay||850);
 const fixed=fixedMonthlyTotal();
 const savings=paydays*Number(state.settings?.savingPerPay||25);
 const availableAfterFixed=Math.max(0,income-fixed-savings);
 const living=Math.min(variableTargetTotal(),availableAfterFixed);
 const separateDebtRoom=Math.max(0,availableAfterFixed-living);
 return {paydays,income,fixed,savings,living,separateDebtRoom};
}
function renderMonthlyDashboard(){
 if(!$("todayLabel"))return;
 const now=new Date(),y=now.getFullYear(),m=now.getMonth(),day=now.getDate(),dim=daysInMonth(y,m+1);
 $("todayLabel").textContent=now.toLocaleDateString(undefined,{month:"short",day:"numeric"});
 $("currentMonthTitle").textContent="Current spending power";
 $("monthProgressText").textContent="Day "+day+" of "+dim+" · based on what you have now, not assumed September history";

 const cash=cashOnHandNow(),nextPay=nextPaydayOnOrAfter(now),days=Math.max(1,Math.ceil((nextPay-now)/(1000*60*60*24)));
 const expensesBeforePay=plannedNonDebtExpensesBetween(now,nextPay);
 const safe=Math.max(0,cash-expensesBeforePay);
 $("cashOnHand").textContent=money(cash);$("cashOnHand").className="mini-value "+(cash<100?"bad":"gold");
 $("nextPaydayLabel").textContent=nextPay.toLocaleDateString(undefined,{month:"short",day:"numeric"});
 $("safeUntilPayday").textContent=money(safe);$("safeUntilPayday").className="mini-value "+(safe<50?"warn":"good");
 $("dailyGuide").textContent=money(safe/days)+"/day";
 $("trackingNote").textContent="Tracking started "+parseDateOnly(state.settings?.trackingStartDate||"2026-09-18").toLocaleDateString(undefined,{month:"short",day:"numeric"})+". Earlier spending is not treated as known; your current cash already reflects it.";

 const model=regularMonthModel(y,m);
 const remainingPays=remainingPaydaysInMonth(now);
 const remainingRegularIncome=remainingPays*Number(state.settings?.biweeklyPay||850);
 const currentMonthCapacity=Math.max(0,cash+remainingRegularIncome-plannedNonDebtExpensesBetween(now,new Date(y,m+1,1))-remainingPays*Number(state.settings?.savingPerPay||25));
 const currentLiving=Math.min(variableTargetTotal(),currentMonthCapacity);

 $("livingBudgetTitle").textContent=now.toLocaleDateString(undefined,{month:"long"})+" living budget";
 $("regularIncome").textContent=money(model.income);
 $("fixedObligations").textContent=money(model.fixed+model.savings);
 $("livingBudget").textContent=money(currentLiving);
 const currentDebtRoom=Math.max(0,currentMonthCapacity-currentLiving);
 $("debtRoom").textContent=money(currentDebtRoom);
 $("livingBudgetExplain").textContent="For the rest of this month, the app uses current cash + remaining regular pay, then subtracts planned non-card expenses and savings. Credit-card payments are not counted as living expenses.";

 const outlook=$("monthlyOutlook");outlook.innerHTML="";
 for(let i=0;i<4;i++){
   const d=new Date(y,m+i,1),model2=regularMonthModel(d.getFullYear(),d.getMonth());
   const r=document.createElement("div");r.className="month-row";
   let living=model2.living,debtRoom=model2.separateDebtRoom;
   if(i===0){living=currentLiving;debtRoom=currentDebtRoom}
   r.innerHTML='<div class="month-date">'+d.toLocaleDateString(undefined,{month:"short",year:"numeric"})+'</div><div><div class="list-title">'+money(living)+' living budget</div><div class="list-meta">'+money(model2.income)+' regular income · '+money(model2.fixed)+' fixed/other obligations · '+money(model2.savings)+' savings</div></div><div class="amount '+(debtRoom>0?"good":"")+'">'+money(debtRoom)+' debt room</div>';
   outlook.appendChild(r);
 }

 const need=remainingToUtilTarget();
 const plannedDebt=(state.plan||[]).filter(p=>p.type==="cardPayment"&&parseDateOnly(p.date)>=now).reduce((s,p)=>s+Number(p.amount||0),0);
 $("debtForecastText").textContent=need<=0?"Under your utilization target already":money(need)+" still needed to reach <"+Number(state.settings?.utilTarget??35)+"%";
 $("debtForecastSub").textContent="You currently have "+money(plannedDebt)+" in future card payments planned. These payments are separate from the living-budget numbers above.";
}
function renderIncomeSettings(){
 if(!$("biweeklyPayInput"))return;
 $("biweeklyPayInput").value=Number(state.settings?.biweeklyPay||850);
 $("nextPayDateInput").value=state.settings?.nextPayDate||"2026-10-01";
 if($("savingPerPayInput"))$("savingPerPayInput").value=Number(state.settings?.savingPerPay||25);
 if($("trackingStartInput"))$("trackingStartInput").value=state.settings?.trackingStartDate||"2026-09-18";
}

function accountCard(a){
 const d=document.createElement("div");d.className="account-card";
 const cls=a.type==="credit"?(a.balance>0?"bad":"good"):"gold";
 let extra=esc(a.type);
 if(a.type==="credit"&&Number(a.creditLimit)>0){
   const available=Math.max(0,Number(a.creditLimit)-Number(a.balance));
   const util=Math.max(0,Number(a.balance)/Number(a.creditLimit)*100);
   extra='Credit · '+util.toFixed(1)+'% used · '+money(available)+' available';
 }
 d.innerHTML='<div class="account-name">'+esc(a.name)+'</div><div class="account-value '+cls+'">'+money(a.balance)+'</div><div class="account-type">'+extra+'</div>';
 d.addEventListener("click",()=>openAccount(a.id));return d;
}
function renderAccounts(){
 const cashWrap=$("homeCashAccounts"),creditWrap=$("homeCreditAccounts");
 if(!cashWrap||!creditWrap)return;
 cashWrap.innerHTML="";creditWrap.innerHTML="";
 const cash=state.accounts.filter(a=>["chequing","savings","cash"].includes(a.type));
 const credit=state.accounts.filter(a=>a.type==="credit");
 if(!cash.length)cashWrap.innerHTML='<div class="account-empty">No cash accounts.</div>';else cash.forEach(a=>cashWrap.appendChild(accountCard(a)));
 if(!credit.length)creditWrap.innerHTML='<div class="account-empty">No credit cards.</div>';else credit.forEach(a=>creditWrap.appendChild(accountCard(a)));
}
function renderQuick(){
 const wrap=$("quickActions");wrap.innerHTML="";const qs=state.categories.filter(c=>c.quick);
 if(!qs.length){wrap.innerHTML='<div class="empty">No quick categories. Tap Edit to add some.</div>';return}
 qs.forEach(c=>{const b=document.createElement("button");b.className="quick-btn";b.innerHTML=esc(c.emoji||"•")+" "+esc(c.name)+"<span>Quick expense</span>";b.onclick=()=>{selectedCategoryId=c.id;showPage("add");setTimeout(()=>$("txAmount").focus(),100)};wrap.appendChild(b)});
}
function drawBudgets(wrap){
 wrap.innerHTML="";
 state.categories.filter(c=>Number(c.budget)>0).forEach(c=>{
  const used=spendFor(c.id),target=Number(c.budget),pct=Math.min(100,target?used/target*100:0),remain=target-used;
  const now=new Date(),threshold=target*(now.getDate()/daysInMonth(now.getFullYear(),now.getMonth()+1)),paceOver=used-threshold;
  const d=document.createElement("div");d.style.margin="13px 0";
  d.innerHTML='<div style="display:flex;justify-content:space-between;gap:10px;font-size:13px"><span>'+esc(c.emoji||"")+' '+esc(c.name)+'</span><span>'+money(used)+' / '+money(target)+'</span></div><div class="bar"><div class="fill" style="width:'+pct+'%"></div></div><div class="threshold-line"><span>'+(remain>=0?money(remain)+" left":money(Math.abs(remain))+" over")+'</span><span class="'+(paceOver>0?"warn":"good")+'">Day '+now.getDate()+' threshold '+money(threshold)+(paceOver>0?" · "+money(paceOver)+" over pace":" · on pace")+'</span></div>';
  wrap.appendChild(d);
 });
}
function renderBudgets(){$("monthSpend").textContent=money(totalMonthSpend());drawBudgets($("homeBudgets"));drawBudgets($("budgetList"))}
function txSign(t){const a=account(t.accountId);if(!a)return "";if(t.type==="income")return "+";if(t.type==="spend")return a.type==="credit"?"+":"−";if(t.type==="credit")return a.type==="credit"?"−":"+";return ""}
function txRow(t,deletable=false){
 const a=account(t.accountId),c=category(t.categoryId),d=document.createElement("div");d.className="list-row";
 d.innerHTML='<div class="list-main"><div class="list-title">'+esc(t.note||c?.name||"Transaction")+'</div><div class="list-meta">'+t.date+' · '+esc(a?.name||"Deleted account")+' · '+esc(c?.name||"Other")+'</div></div><div class="amount">'+txSign(t)+money(t.amount)+'</div>';
 if(deletable){const b=document.createElement("button");b.className="delete-tx";b.textContent="Delete";b.onclick=()=>deleteTransaction(t.id);d.appendChild(b)}return d;
}
function renderRecent(){const w=$("recentTx");w.innerHTML="";const arr=state.transactions.slice().reverse().slice(0,6);if(!arr.length){w.innerHTML='<div class="empty">No transactions yet.</div>';return}arr.forEach(t=>w.appendChild(txRow(t)))}
function renderHistory(){const w=$("historyList");w.innerHTML="";const fa=$("filterAccount").value,fc=$("filterCategory").value;const arr=state.transactions.filter(t=>(!fa||t.accountId===fa)&&(!fc||t.categoryId===fc)).slice().reverse();if(!arr.length){w.innerHTML='<div class="empty">No matching transactions.</div>';return}arr.forEach(t=>w.appendChild(txRow(t,true)))}
function renderChips(){
 const aw=$("accountChips"),cw=$("categoryChips");aw.innerHTML="";cw.innerHTML="";
 if(!account(selectedAccountId))selectedAccountId=state.accounts[0]?.id||"";if(!category(selectedCategoryId))selectedCategoryId=state.categories[0]?.id||"";
 state.accounts.forEach(a=>{const b=document.createElement("button");b.className="chip"+(a.id===selectedAccountId?" active":"");b.textContent=a.name;b.onclick=()=>{selectedAccountId=a.id;renderChips()};aw.appendChild(b)});
 state.categories.forEach(c=>{const b=document.createElement("button");b.className="chip"+(c.id===selectedCategoryId?" active":"");b.textContent=(c.emoji?c.emoji+" ":"")+c.name;b.onclick=()=>{selectedCategoryId=c.id;renderChips()};cw.appendChild(b)});
}
function renderFilters(){
 const fa=$("filterAccount"),fc=$("filterCategory"),av=fa.value,cv=fc.value;fa.innerHTML='<option value="">All accounts</option>';fc.innerHTML='<option value="">All categories</option>';
 state.accounts.forEach(a=>fa.add(new Option(a.name,a.id)));state.categories.forEach(c=>fc.add(new Option(c.name,c.id)));fa.value=state.accounts.some(a=>a.id===av)?av:"";fc.value=state.categories.some(c=>c.id===cv)?cv:"";
}
function renderSettingsLists(){
 const aw=$("settingsAccounts");aw.innerHTML="";
 state.accounts.forEach(a=>{const r=document.createElement("div");r.className="list-row";r.innerHTML='<div><div class="list-title">'+esc(a.name)+'</div><div class="list-meta">'+a.type+'</div></div><div class="actions"><span class="amount">'+money(a.balance)+'</span><button class="btn secondary small">Edit</button></div>';r.querySelector("button").onclick=()=>openAccount(a.id);aw.appendChild(r)});
 const cw=$("settingsCategories");cw.innerHTML="";
 state.categories.forEach(c=>{const r=document.createElement("div");r.className="list-row";r.innerHTML='<div><div class="list-title">'+esc(c.emoji||"")+' '+esc(c.name)+'</div><div class="list-meta">'+esc(c.kind||"variable")+' · Target '+money(c.budget)+' · Quick '+(c.quick?"Yes":"No")+'</div></div><button class="btn secondary small">Edit</button>';r.querySelector("button").onclick=()=>openCategory(c.id);cw.appendChild(r)});
}
function renderPaymentSelects(){const f=$("paymentFrom"),t=$("paymentTo");f.innerHTML="";t.innerHTML="";state.accounts.filter(a=>a.type!=="credit").forEach(a=>f.add(new Option(a.name,a.id)));state.accounts.filter(a=>a.type==="credit").forEach(a=>t.add(new Option(a.name,a.id)))}
function renderAuth(){$("signedOut").classList.toggle("hide",!!user);$("signedIn").classList.toggle("hide",!user);if(user)$("signedEmail").textContent=user.email||""}



function renderDebtTrajectory(){
 if(!$("debtTrajectory")) return;
 const targetPct=Number(state.settings?.utilTarget??35);
 $("debtTargetBadge").textContent="Target < "+targetPct+"%";
 const wrap=$("debtTrajectory");wrap.innerHTML="";
 const cards=state.accounts.filter(a=>a.type==="credit");
 if(!cards.length){wrap.innerHTML='<div class="empty">Add a credit-card account with a credit limit to track utilization.</div>';return}

 const balances={};
 cards.forEach(a=>balances[a.id]=Number(a.balance)||0);

 function totalLimit(){return cards.reduce((s,a)=>s+Math.max(0,Number(a.creditLimit)||0),0)}
 function totalDebt(){return cards.reduce((s,a)=>s+Math.max(0,balances[a.id]||0),0)}
 function util(){const lim=totalLimit();return lim>0?(totalDebt()/lim*100):0}
 function targetBalance(){return totalLimit()*(targetPct/100)}

 const currentDebt=totalDebt(), currentUtil=util(), maxTargetBal=targetBalance();
 const start=document.createElement("div");start.className="trajectory-row";
 start.innerHTML='<div class="plan-date">Now</div><div><div class="list-title">Current utilization</div><div class="plan-kind">'+money(currentDebt)+' debt · '+money(totalLimit())+' total limit</div></div><div class="trajectory-balance '+(currentUtil<targetPct?"good":"bad")+'">'+currentUtil.toFixed(1)+'%</div>';
 wrap.appendChild(start);

 const payments=(state.plan||[]).filter(p=>p.type==="cardPayment").slice().sort((a,b)=>a.date.localeCompare(b.date));
 if(!payments.length){
   const e=document.createElement("div");e.className="empty";e.textContent="Add planned card payments to see utilization fall over time.";wrap.appendChild(e);return;
 }

 payments.forEach(p=>{
   if(balances[p.toAccountId]!=null) balances[p.toAccountId]=Math.max(0,balances[p.toAccountId]-Number(p.amount||0));
   const debt=totalDebt(), pct=util(), remain=Math.max(0,debt-maxTargetBal);
   const r=document.createElement("div");r.className="trajectory-row";
   const reached=pct<targetPct;
   r.innerHTML='<div class="plan-date">'+esc(p.date)+'</div><div><div class="list-title">'+esc(p.description)+'</div><div class="plan-kind">'+money(p.amount)+' payment · '+(reached?'Target reached — remaining balance is acceptable':money(remain)+' more needed to get under '+targetPct+'%')+'</div></div><div class="trajectory-balance '+(reached?"good":"bad")+'">'+pct.toFixed(1)+'%</div>';
   wrap.appendChild(r);
 });
}
function renderDebtTargetSettings(){
 if(!$("utilTargetInput"))return;
 $("utilTargetInput").value=Number(state.settings?.utilTarget??35);
}

function projectedPlan(){
 const balances={};
 state.accounts.forEach(a=>balances[a.id]=Number(a.balance)||0);
 const items=(state.plan||[]).slice().sort((a,b)=>a.date.localeCompare(b.date));
 items.forEach(p=>{
  const amt=Number(p.amount)||0;
  if(p.type==="income"&&balances[p.accountId]!=null) balances[p.accountId]+=amt;
  else if(p.type==="expense"&&balances[p.accountId]!=null) balances[p.accountId]-=amt;
  else if(p.type==="cardPayment"){
   if(balances[p.fromAccountId]!=null) balances[p.fromAccountId]-=amt;
   if(balances[p.toAccountId]!=null) balances[p.toAccountId]-=amt;
  }
 });
 let cash=0,debt=0;
 state.accounts.forEach(a=>{
  const b=balances[a.id]??0;
  if(a.type==="credit") debt+=Math.max(0,b);
  else if(["chequing","savings","cash"].includes(a.type)) cash+=b;
 });
 return {cash,debt,balances};
}

function tdCard(){
 return state.accounts.find(a=>a.id==="td-credit")||state.accounts.find(a=>a.type==="credit");
}
function paycheckDates(count=10){
 const now=new Date();
 let d=nextPaydayOnOrAfter(now);
 const out=[];
 for(let i=0;i<count;i++){out.push(new Date(d));d=addDays(d,14)}
 return out;
}
function monthlyLivingReserveFor(date){
 const model=regularMonthModel(date.getFullYear(),date.getMonth());
 const pays=Math.max(1,model.paydays);
 return {
   fixedPerPay:model.fixed/pays,
   variablePerPay:model.living/pays,
   savingsPerPay:Number(state.settings?.savingPerPay||25),
   income:Number(state.settings?.biweeklyPay||850)
 };
}
function renderPaycheckDebtPlan(){
 if(!$("paycheckDebtPlan"))return;
 const card=tdCard();
 if(!card){$("paycheckDebtPlan").innerHTML='<div class="empty">Add a credit card to build a payoff plan.</div>';return}
 if(!Number(card.creditLimit)||Number(card.creditLimit)<=0)card.creditLimit=2500;
 const limit=Number(card.creditLimit),targetPct=Number(state.settings?.utilTarget??35),targetBal=limit*(targetPct/100);
 let debt=Math.max(0,Number(card.balance)||0);
 const util=limit>0?debt/limit*100:0;
 $("currentTdUtil").textContent=util.toFixed(1)+"%";
 $("currentTdUtil").className="account-value "+(util<targetPct?"good":"bad");
 $("currentTdDebt").textContent=money(debt)+" / "+money(limit);
 $("tdTargetBalance").textContent=money(targetBal);

 const wrap=$("paycheckDebtPlan");wrap.innerHTML="";
 if(debt<targetBal){
   $("paycheckPlanStatus").textContent="Target reached";$("paycheckPlanStatus").className="badge ok";
   wrap.innerHTML='<div class="empty">Your TD balance is already below the utilization target.</div>';return;
 }
 $("paycheckPlanStatus").textContent="Target < "+targetPct+"%";$("paycheckPlanStatus").className="badge warn";

 const dates=paycheckDates(10);
 let reached=false;
 dates.forEach(d=>{
   if(reached)return;
   const a=monthlyLivingReserveFor(d);
   const reserve=a.fixedPerPay+a.variablePerPay+a.savingsPerPay;
   const safeDebt=Math.max(0,a.income-reserve);
   const need=Math.max(0,debt-targetBal+0.01); // ensure strictly below target
   const payment=Math.min(safeDebt,need);
   const after=Math.max(0,debt-payment);
   const afterUtil=limit>0?after/limit*100:0;
   const keep=Math.max(0,a.income-payment);
   const row=document.createElement("div");row.className="paycheck-row";
   row.innerHTML='<div class="paycheck-head"><div><div class="list-title">'+d.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})+' paycheck</div><div class="paycheck-date">'+money(a.income)+' estimated take-home</div></div><div class="paycheck-payment">'+money(payment)+' → TD</div></div>'+
   '<div class="allocation-grid">'+
   '<div class="allocation-cell"><div class="allocation-label">Bills reserve</div><div class="allocation-value">'+money(a.fixedPerPay)+'</div></div>'+
   '<div class="allocation-cell"><div class="allocation-label">Day-to-day</div><div class="allocation-value">'+money(a.variablePerPay)+'</div></div>'+
   '<div class="allocation-cell"><div class="allocation-label">Savings</div><div class="allocation-value">'+money(a.savingsPerPay)+'</div></div>'+
   '<div class="allocation-cell"><div class="allocation-label">Left after TD</div><div class="allocation-value">'+money(keep)+'</div></div>'+
   '</div><div class="sub" style="margin-top:7px">TD after payment: '+money(after)+' · '+afterUtil.toFixed(1)+'% utilization · '+(payment/a.income*100).toFixed(0)+'% of this paycheck to the card</div>';
   wrap.appendChild(row);
   debt=after;
   if(afterUtil<targetPct){reached=true}
 });
 if(!reached){
   const note=document.createElement("div");note.className="empty";note.textContent="At the current income and living-cost assumptions, the target takes longer than the paychecks shown.";wrap.appendChild(note);
 }
}

function renderPlan(){
 if(!$("planList")) return;
 renderPaycheckDebtPlan();
 const wrap=$("planList");wrap.innerHTML="";
 const arr=(state.plan||[]).slice().sort((a,b)=>a.date.localeCompare(b.date));
 if(!arr.length){wrap.innerHTML='<div class="empty">No planned items yet.</div>';return}
 arr.forEach(p=>{
  const r=document.createElement("div");r.className="plan-row";
  let meta=p.type==="income"?"Income":p.type==="expense"?"Expense":"Card payment";
  let target="";
  if(p.type==="cardPayment") target=(account(p.fromAccountId)?.name||"Account")+" → "+(account(p.toAccountId)?.name||"Card");
  else target=account(p.accountId)?.name||"Account";
  r.innerHTML='<div class="plan-date">'+esc(p.date)+'</div><button type="button"><div class="list-title">'+esc(p.description)+'</div><div class="plan-kind">'+esc(meta)+' · '+esc(target)+'</div></button><div class="amount '+(p.type==="income"?"good":"")+'">'+(p.type==="income"?"+":"−")+money(p.amount)+'</div>';
  r.querySelector("button").onclick=()=>openPlan(p.id);
  wrap.appendChild(r);
 });
}
function fillPlanAccountSelects(){
 const a=$("planAccount"),f=$("planPayFrom"),t=$("planPayTo");
 if(!a||!f||!t)return;
 a.innerHTML="";f.innerHTML="";t.innerHTML="";
 state.accounts.forEach(x=>a.add(new Option(x.name,x.id)));
 state.accounts.filter(x=>x.type!=="credit").forEach(x=>f.add(new Option(x.name,x.id)));
 state.accounts.filter(x=>x.type==="credit").forEach(x=>t.add(new Option(x.name,x.id)));
}
function setPlanTypeUI(){
 const isPay=$("planType").value==="cardPayment";
 $("planAccountWrap").classList.toggle("hide",isPay);
 $("planPaymentWrap").classList.toggle("hide",!isPay);
}
function openPlan(id=""){
 fillPlanAccountSelects();
 const p=(state.plan||[]).find(x=>x.id===id);
 $("editPlanId").value=p?.id||"";
 $("planModalTitle").textContent=p?"Edit planned item":"Add planned item";
 $("planDate").value=p?.date||today();
 $("planType").value=p?.type||"expense";
 $("planDesc").value=p?.description||"";
 $("planAmount").value=p?.amount??"";
 if(p?.accountId)$("planAccount").value=p.accountId;
 if(p?.fromAccountId)$("planPayFrom").value=p.fromAccountId;
 if(p?.toAccountId)$("planPayTo").value=p.toAccountId;
 $("deletePlanBtn").classList.toggle("hide",!p);
 setPlanTypeUI();
 $("planModal").classList.remove("hide");
}


function deleteTransaction(id){
 const t=state.transactions.find(x=>x.id===id);if(!t)return;
 if(!confirm("Delete this transaction and reverse its balance effect?"))return;
 const linked=t.groupId?state.transactions.filter(x=>x.groupId===t.groupId):[t];
 linked.forEach(x=>applyTransaction(x,-1));
 const ids=new Set(linked.map(x=>x.id));state.transactions=state.transactions.filter(x=>!ids.has(x.id));save();
}

function applyTransaction(t,dir=1){const a=account(t.accountId);if(!a)return;const n=Number(t.amount)*dir;if(t.type==="spend")a.balance+=a.type==="credit"?n:-n;else if(t.type==="income")a.balance+=n;else if(t.type==="credit")a.balance+=a.type==="credit"?-n:n}
function addTransaction(t){applyTransaction(t);state.transactions.push(t);save()}
function showPage(p){document.querySelectorAll(".page").forEach(x=>x.classList.toggle("active",x.id==="page-"+p));document.querySelectorAll(".nav-btn").forEach(x=>x.classList.toggle("active",x.dataset.page===p));window.scrollTo(0,0)}
document.querySelectorAll(".nav-btn").forEach(b=>b.onclick=()=>showPage(b.dataset.page));document.querySelectorAll(".go-history").forEach(b=>b.onclick=()=>showPage("history"));

$("txDate").value=today();$("paymentDate").value=today();
$("saveTxBtn").onclick=()=>{const amount=Number($("txAmount").value);if(!amount||amount<=0)return $("txStatus").textContent="Enter an amount.";if(!selectedAccountId||!selectedCategoryId)return $("txStatus").textContent="Choose an account and category.";addTransaction({id:uid(),date:$("txDate").value||today(),accountId:selectedAccountId,categoryId:selectedCategoryId,type:$("txType").value,amount,note:$("txNote").value.trim()});$("txAmount").value="";$("txNote").value="";$("txStatus").textContent="Saved.";showPage("home")};
$("cardPaymentBtn").onclick=()=>$("paymentModal").classList.remove("hide");
$("savePaymentBtn").onclick=()=>{const from=account($("paymentFrom").value),to=account($("paymentTo").value),amt=Number($("paymentAmount").value);if(!from||!to||!amt)return;from.balance-=amt;to.balance-=amt;const groupId=uid();state.transactions.push({id:uid(),groupId,date:$("paymentDate").value||today(),accountId:from.id,categoryId:"other",type:"spend",amount:amt,note:"Payment to "+to.name});state.transactions.push({id:uid(),groupId,date:$("paymentDate").value||today(),accountId:to.id,categoryId:"other",type:"credit",amount:amt,note:"Payment from "+from.name});save();$("paymentModal").classList.add("hide");$("paymentAmount").value=""};

function openAccount(id=""){const a=account(id);$("editAccountId").value=a?.id||"";$("accountModalTitle").textContent=a?"Edit account":"Add account";$("accountName").value=a?.name||"";$("accountType").value=a?.type||"chequing";$("accountBalance").value=a?.balance??0;$("accountCreditLimit").value=a?.creditLimit??0;$("creditLimitWrap").classList.toggle("hide",(a?.type||$("accountType").value)!=="credit");$("deleteAccountBtn").classList.toggle("hide",!a);$("accountModal").classList.remove("hide")}
$("accountType").onchange=()=>$("creditLimitWrap").classList.toggle("hide",$("accountType").value!=="credit");
$("addAccountBtn").onclick=()=>openAccount();$("homeManageAccounts").onclick=()=>showPage("settings");
$("saveAccountBtn").onclick=()=>{const name=$("accountName").value.trim(),bal=Number($("accountBalance").value);if(!name||!Number.isFinite(bal))return;const id=$("editAccountId").value;const type=$("accountType").value,creditLimit=type==="credit"?(Number($("accountCreditLimit").value)||0):0;if(id)Object.assign(account(id),{name,type,balance:bal,creditLimit});else state.accounts.push({id:uid(),name,type,balance:bal,creditLimit});save();$("accountModal").classList.add("hide")};
$("deleteAccountBtn").onclick=()=>{const id=$("editAccountId").value;if(!id)return;if(!confirm("Delete this account?"))return;state.accounts=state.accounts.filter(a=>a.id!==id);save();$("accountModal").classList.add("hide")};

function openCategory(id=""){const c=category(id);$("editCategoryId").value=c?.id||"";$("categoryModalTitle").textContent=c?"Edit category":"Add category";$("categoryName").value=c?.name||"";$("categoryEmoji").value=c?.emoji||"";$("categoryBudget").value=c?.budget??0;$("categoryKind").value=c?.kind||"variable";$("categoryQuick").checked=!!c?.quick;$("deleteCategoryBtn").classList.toggle("hide",!c);$("categoryModal").classList.remove("hide")}
$("addCategoryBtn").onclick=()=>openCategory();$("manageCatsBtn").onclick=()=>showPage("settings");$("editQuickBtn").onclick=()=>showPage("settings");
$("saveCategoryBtn").onclick=()=>{const name=$("categoryName").value.trim();if(!name)return;const id=$("editCategoryId").value;const data={name,emoji:$("categoryEmoji").value.trim(),budget:Number($("categoryBudget").value)||0,kind:$("categoryKind").value,quick:$("categoryQuick").checked};if(id)Object.assign(category(id),data);else state.categories.push({id:uid(),...data});save();$("categoryModal").classList.add("hide")};
$("deleteCategoryBtn").onclick=()=>{const id=$("editCategoryId").value;if(!id)return;if(!confirm("Delete this category?"))return;state.categories=state.categories.filter(c=>c.id!==id);save();$("categoryModal").classList.add("hide")};
document.querySelectorAll(".close-modal").forEach(b=>b.onclick=()=>b.closest(".modal-bg").classList.add("hide"));

$("saveBudgetAssumptionsBtn").onclick=()=>{
 const d=$("trackingStartInput").value,s=Number($("savingPerPayInput").value);
 if(!d||!Number.isFinite(s)||s<0)return;
 state.settings=state.settings||{};state.settings.trackingStartDate=d;state.settings.savingPerPay=s;save();
};
$("saveIncomeSettingsBtn").onclick=()=>{const pay=Number($("biweeklyPayInput").value),date=$("nextPayDateInput").value;if(!Number.isFinite(pay)||pay<0||!date)return;state.settings=state.settings||{};state.settings.biweeklyPay=pay;state.settings.nextPayDate=date;save();};
$("saveUtilTargetBtn").onclick=()=>{const v=Number($("utilTargetInput").value);if(!Number.isFinite(v)||v<=0||v>100)return;state.settings=state.settings||{};state.settings.utilTarget=v;save();};
$("addPlanBtn").onclick=()=>openPlan();
$("planType").onchange=setPlanTypeUI;
$("savePlanBtn").onclick=()=>{
 const amount=Number($("planAmount").value),description=$("planDesc").value.trim(),date=$("planDate").value;
 if(!amount||amount<=0||!description||!date)return;
 const type=$("planType").value,id=$("editPlanId").value;
 const item={id:id||uid(),date,type,description,amount};
 if(type==="cardPayment"){item.fromAccountId=$("planPayFrom").value;item.toAccountId=$("planPayTo").value}
 else item.accountId=$("planAccount").value;
 if(id){const i=state.plan.findIndex(x=>x.id===id);if(i>=0)state.plan[i]=item}else state.plan.push(item);
 save();$("planModal").classList.add("hide");
};
$("deletePlanBtn").onclick=()=>{
 const id=$("editPlanId").value;if(!id)return;if(!confirm("Delete this planned item?"))return;
 state.plan=state.plan.filter(x=>x.id!==id);save();$("planModal").classList.add("hide");
};

$("filterAccount").onchange=renderHistory;$("filterCategory").onchange=renderHistory;

function cloudBadge(kind,text){const b=$("cloudBadge");b.className="badge "+kind;b.textContent=text}
function scheduleSync(){if(!user||!cloudReady)return;clearTimeout(syncTimer);syncTimer=setTimeout(uploadCloud,600)}
async function uploadCloud(){if(!user||syncing)return;syncing=true;cloudBadge("warn","Syncing…");try{const {error}=await sb.from("finance_state").upsert({user_id:user.id,data:state,updated_at:new Date().toISOString()},{onConflict:"user_id"});if(error)throw error;cloudBadge("ok","Synced");$("syncText").textContent="Synced"}catch(e){cloudBadge("off","Sync error");$("cloudMsg").textContent=e.message}finally{syncing=false}}
async function loadCloud(){if(!user)return;const {data,error}=await sb.from("finance_state").select("data").eq("user_id",user.id).maybeSingle();if(error)throw error;if(data?.data&&Array.isArray(data.data.accounts)){state={...clone(defaults),...data.data,accounts:normalizeAccounts(data.data.accounts),categories:Array.isArray(data.data.categories)?data.data.categories:clone(defaults.categories),transactions:Array.isArray(data.data.transactions)?data.data.transactions:[],plan:Array.isArray(data.data.plan)?data.data.plan:clone(defaults.plan),settings:{...clone(defaults.settings),...(data.data.settings||{})}};
 const cids=new Set((state.categories||[]).map(c=>c.id));defaults.categories.forEach(c=>{if(!cids.has(c.id))state.categories.push(clone(c))});
 state.categories=state.categories.map(c=>{const d=defaults.categories.find(x=>x.id===c.id);return {...(d||{}),...c,kind:c.kind||(d?.kind||"variable")}});
 localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}else await uploadCloud();cloudReady=true;render();cloudBadge("ok","Synced")}
async function initAuth(){const {data:{session}}=await sb.auth.getSession();user=session?.user||null;renderAuth();if(user)await loadCloud();else cloudBadge("warn","Not signed in");sb.auth.onAuthStateChange(async(_,session)=>{user=session?.user||null;cloudReady=false;renderAuth();if(user)await loadCloud();else cloudBadge("warn","Not signed in")})}
$("signInBtn").onclick=async()=>{const email=$("authEmail").value.trim(),password=$("authPassword").value;const {error}=await sb.auth.signInWithPassword({email,password});$("cloudMsg").textContent=error?error.message:"Signed in."};
$("signUpBtn").onclick=async()=>{const email=$("authEmail").value.trim(),password=$("authPassword").value;if(password.length<6)return $("cloudMsg").textContent="Use at least 6 characters.";const {error}=await sb.auth.signUp({email,password});$("cloudMsg").textContent=error?error.message:"Account created."};
$("signOutBtn").onclick=()=>sb.auth.signOut();$("syncBtn").onclick=uploadCloud;
window.addEventListener("focus",()=>{if(user)loadCloud().catch(()=>{})});document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&user)loadCloud().catch(()=>{})});

$("exportBtn").onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="money-tracker-v5-backup.json";a.click()};
$("importBtn").onclick=()=>$("importFile").click();
$("importFile").onchange=async e=>{try{const x=JSON.parse(await e.target.files[0].text());if(!Array.isArray(x.accounts)||!Array.isArray(x.categories))throw 0;if(!Array.isArray(x.plan))x.plan=clone(defaults.plan);if(!x.settings)x.settings=clone(defaults.settings);x.settings={...clone(defaults.settings),...x.settings};const ids=new Set((x.categories||[]).map(c=>c.id));defaults.categories.forEach(c=>{if(!ids.has(c.id))x.categories.push(clone(c))});
 x.categories=x.categories.map(c=>{const d=defaults.categories.find(z=>z.id===c.id);return {...(d||{}),...c,kind:c.kind||(d?.kind||"variable")}});
 state=x;save()}catch(err){alert("Invalid backup")}e.target.value=""};

if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js");
state.accounts=normalizeAccounts(state.accounts);render();initAuth();