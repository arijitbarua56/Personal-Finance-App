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
  {id:"td-credit",name:"TD Credit Card",type:"credit",balance:2490.30},
  {id:"rbc-credit",name:"RBC Credit Card",type:"credit",balance:0}
 ],
 categories:[
  {id:"groceries",name:"Groceries",emoji:"🛒",budget:275,quick:true},
  {id:"transport",name:"Transportation",emoji:"🚕",budget:330,quick:true},
  {id:"eating",name:"Eating Out",emoji:"🍔",budget:40,quick:true},
  {id:"rent",name:"Rent",emoji:"🏠",budget:600,quick:false},
  {id:"phone",name:"Phone",emoji:"📱",budget:160,quick:false},
  {id:"shopping",name:"Shopping / Personal",emoji:"🛍️",budget:40,quick:false},
  {id:"friend",name:"Friend Repayment",emoji:"🤝",budget:75,quick:false},
  {id:"other",name:"Other",emoji:"•",budget:0,quick:false}
 ],
 transactions:[]
};

let state=loadState();
let user=null,syncing=false,syncTimer=null,cloudReady=false;
let selectedAccountId=state.accounts[0]?.id||"",selectedCategoryId=state.categories[0]?.id||"";
const $=id=>document.getElementById(id);
const money=n=>"$"+Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const today=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random();

function clone(x){return JSON.parse(JSON.stringify(x))}
function migrateLegacy(raw){
 try{
  const s=JSON.parse(raw);
  if(Array.isArray(s.accounts)) return s;
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
 return clone(defaults);
}
function save(localOnly=false){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));render();if(!localOnly)scheduleSync()}
function account(id){return state.accounts.find(a=>a.id===id)}
function category(id){return state.categories.find(c=>c.id===id)}
function spendFor(catId){const ym=today().slice(0,7);return state.transactions.filter(t=>t.categoryId===catId&&t.type==="spend"&&t.date.startsWith(ym)).reduce((s,t)=>s+Number(t.amount),0)}
function totalMonthSpend(){return state.transactions.filter(t=>t.type==="spend"&&t.date.startsWith(today().slice(0,7))).reduce((s,t)=>s+Number(t.amount),0)}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}

function render(){renderAccounts();renderQuick();renderBudgets();renderHistory();renderRecent();renderChips();renderFilters();renderSettingsLists();renderPaymentSelects();renderAuth()}
function renderAccounts(){
 const wrap=$("homeAccounts");wrap.innerHTML="";
 state.accounts.forEach(a=>{
  const d=document.createElement("div");d.className="account-card";
  const cls=a.type==="credit"?(a.balance>0?"bad":"good"):"gold";
  d.innerHTML='<div class="account-name">'+esc(a.name)+'</div><div class="account-value '+cls+'">'+money(a.balance)+'</div><div class="account-type">'+esc(a.type)+'</div>';
  d.addEventListener("click",()=>openAccount(a.id));wrap.appendChild(d);
 });
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
  const d=document.createElement("div");d.style.margin="13px 0";
  d.innerHTML='<div style="display:flex;justify-content:space-between;gap:10px;font-size:13px"><span>'+esc(c.emoji||"")+' '+esc(c.name)+'</span><span>'+money(used)+' / '+money(target)+'</span></div><div class="bar"><div class="fill" style="width:'+pct+'%"></div></div><div class="sub '+(remain<0?"bad":"")+'" style="margin-top:4px">'+(remain>=0?money(remain)+" left":money(Math.abs(remain))+" over")+'</div>';
  wrap.appendChild(d);
 });
}
function renderBudgets(){$("monthSpend").textContent=money(totalMonthSpend());drawBudgets($("homeBudgets"));drawBudgets($("budgetList"))}
function txSign(t){const a=account(t.accountId);if(!a)return "";if(t.type==="income")return "+";if(t.type==="spend")return a.type==="credit"?"+":"−";if(t.type==="credit")return a.type==="credit"?"−":"+";return ""}
function txRow(t){
 const a=account(t.accountId),c=category(t.categoryId),d=document.createElement("div");d.className="list-row";
 d.innerHTML='<div class="list-main"><div class="list-title">'+esc(t.note||c?.name||"Transaction")+'</div><div class="list-meta">'+t.date+' · '+esc(a?.name||"Deleted account")+' · '+esc(c?.name||"Other")+'</div></div><div class="amount">'+txSign(t)+money(t.amount)+'</div>';return d;
}
function renderRecent(){const w=$("recentTx");w.innerHTML="";const arr=state.transactions.slice().reverse().slice(0,6);if(!arr.length){w.innerHTML='<div class="empty">No transactions yet.</div>';return}arr.forEach(t=>w.appendChild(txRow(t)))}
function renderHistory(){const w=$("historyList");w.innerHTML="";const fa=$("filterAccount").value,fc=$("filterCategory").value;const arr=state.transactions.filter(t=>(!fa||t.accountId===fa)&&(!fc||t.categoryId===fc)).slice().reverse();if(!arr.length){w.innerHTML='<div class="empty">No matching transactions.</div>';return}arr.forEach(t=>w.appendChild(txRow(t)))}
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
 state.categories.forEach(c=>{const r=document.createElement("div");r.className="list-row";r.innerHTML='<div><div class="list-title">'+esc(c.emoji||"")+' '+esc(c.name)+'</div><div class="list-meta">Budget '+money(c.budget)+' · Quick '+(c.quick?"Yes":"No")+'</div></div><button class="btn secondary small">Edit</button>';r.querySelector("button").onclick=()=>openCategory(c.id);cw.appendChild(r)});
}
function renderPaymentSelects(){const f=$("paymentFrom"),t=$("paymentTo");f.innerHTML="";t.innerHTML="";state.accounts.filter(a=>a.type!=="credit").forEach(a=>f.add(new Option(a.name,a.id)));state.accounts.filter(a=>a.type==="credit").forEach(a=>t.add(new Option(a.name,a.id)))}
function renderAuth(){$("signedOut").classList.toggle("hide",!!user);$("signedIn").classList.toggle("hide",!user);if(user)$("signedEmail").textContent=user.email||""}

function applyTransaction(t,dir=1){const a=account(t.accountId);if(!a)return;const n=Number(t.amount)*dir;if(t.type==="spend")a.balance+=a.type==="credit"?n:-n;else if(t.type==="income")a.balance+=n;else if(t.type==="credit")a.balance+=a.type==="credit"?-n:n}
function addTransaction(t){applyTransaction(t);state.transactions.push(t);save()}
function showPage(p){document.querySelectorAll(".page").forEach(x=>x.classList.toggle("active",x.id==="page-"+p));document.querySelectorAll(".nav-btn").forEach(x=>x.classList.toggle("active",x.dataset.page===p));window.scrollTo(0,0)}
document.querySelectorAll(".nav-btn").forEach(b=>b.onclick=()=>showPage(b.dataset.page));document.querySelectorAll(".go-history").forEach(b=>b.onclick=()=>showPage("history"));

$("txDate").value=today();$("paymentDate").value=today();
$("saveTxBtn").onclick=()=>{const amount=Number($("txAmount").value);if(!amount||amount<=0)return $("txStatus").textContent="Enter an amount.";if(!selectedAccountId||!selectedCategoryId)return $("txStatus").textContent="Choose an account and category.";addTransaction({id:uid(),date:$("txDate").value||today(),accountId:selectedAccountId,categoryId:selectedCategoryId,type:$("txType").value,amount,note:$("txNote").value.trim()});$("txAmount").value="";$("txNote").value="";$("txStatus").textContent="Saved.";showPage("home")};
$("cardPaymentBtn").onclick=()=>$("paymentModal").classList.remove("hide");
$("savePaymentBtn").onclick=()=>{const from=account($("paymentFrom").value),to=account($("paymentTo").value),amt=Number($("paymentAmount").value);if(!from||!to||!amt)return;from.balance-=amt;to.balance-=amt;state.transactions.push({id:uid(),date:$("paymentDate").value||today(),accountId:from.id,categoryId:"other",type:"spend",amount:amt,note:"Payment to "+to.name});state.transactions.push({id:uid(),date:$("paymentDate").value||today(),accountId:to.id,categoryId:"other",type:"credit",amount:amt,note:"Payment from "+from.name});save();$("paymentModal").classList.add("hide");$("paymentAmount").value=""};

function openAccount(id=""){const a=account(id);$("editAccountId").value=a?.id||"";$("accountModalTitle").textContent=a?"Edit account":"Add account";$("accountName").value=a?.name||"";$("accountType").value=a?.type||"chequing";$("accountBalance").value=a?.balance??0;$("deleteAccountBtn").classList.toggle("hide",!a);$("accountModal").classList.remove("hide")}
$("addAccountBtn").onclick=()=>openAccount();$("homeManageAccounts").onclick=()=>showPage("settings");
$("saveAccountBtn").onclick=()=>{const name=$("accountName").value.trim(),bal=Number($("accountBalance").value);if(!name||!Number.isFinite(bal))return;const id=$("editAccountId").value;if(id)Object.assign(account(id),{name,type:$("accountType").value,balance:bal});else state.accounts.push({id:uid(),name,type:$("accountType").value,balance:bal});save();$("accountModal").classList.add("hide")};
$("deleteAccountBtn").onclick=()=>{const id=$("editAccountId").value;if(!id)return;if(!confirm("Delete this account?"))return;state.accounts=state.accounts.filter(a=>a.id!==id);save();$("accountModal").classList.add("hide")};

function openCategory(id=""){const c=category(id);$("editCategoryId").value=c?.id||"";$("categoryModalTitle").textContent=c?"Edit category":"Add category";$("categoryName").value=c?.name||"";$("categoryEmoji").value=c?.emoji||"";$("categoryBudget").value=c?.budget??0;$("categoryQuick").checked=!!c?.quick;$("deleteCategoryBtn").classList.toggle("hide",!c);$("categoryModal").classList.remove("hide")}
$("addCategoryBtn").onclick=()=>openCategory();$("manageCatsBtn").onclick=()=>showPage("settings");$("editQuickBtn").onclick=()=>showPage("settings");
$("saveCategoryBtn").onclick=()=>{const name=$("categoryName").value.trim();if(!name)return;const id=$("editCategoryId").value;const data={name,emoji:$("categoryEmoji").value.trim(),budget:Number($("categoryBudget").value)||0,quick:$("categoryQuick").checked};if(id)Object.assign(category(id),data);else state.categories.push({id:uid(),...data});save();$("categoryModal").classList.add("hide")};
$("deleteCategoryBtn").onclick=()=>{const id=$("editCategoryId").value;if(!id)return;if(!confirm("Delete this category?"))return;state.categories=state.categories.filter(c=>c.id!==id);save();$("categoryModal").classList.add("hide")};
document.querySelectorAll(".close-modal").forEach(b=>b.onclick=()=>b.closest(".modal-bg").classList.add("hide"));
$("filterAccount").onchange=renderHistory;$("filterCategory").onchange=renderHistory;

function cloudBadge(kind,text){const b=$("cloudBadge");b.className="badge "+kind;b.textContent=text}
function scheduleSync(){if(!user||!cloudReady)return;clearTimeout(syncTimer);syncTimer=setTimeout(uploadCloud,600)}
async function uploadCloud(){if(!user||syncing)return;syncing=true;cloudBadge("warn","Syncing…");try{const {error}=await sb.from("finance_state").upsert({user_id:user.id,data:state,updated_at:new Date().toISOString()},{onConflict:"user_id"});if(error)throw error;cloudBadge("ok","Synced");$("syncText").textContent="Synced"}catch(e){cloudBadge("off","Sync error");$("cloudMsg").textContent=e.message}finally{syncing=false}}
async function loadCloud(){if(!user)return;const {data,error}=await sb.from("finance_state").select("data").eq("user_id",user.id).maybeSingle();if(error)throw error;if(data?.data&&Array.isArray(data.data.accounts)){state={...clone(defaults),...data.data,accounts:data.data.accounts,categories:Array.isArray(data.data.categories)?data.data.categories:clone(defaults.categories),transactions:Array.isArray(data.data.transactions)?data.data.transactions:[]};localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}else await uploadCloud();cloudReady=true;render();cloudBadge("ok","Synced")}
async function initAuth(){const {data:{session}}=await sb.auth.getSession();user=session?.user||null;renderAuth();if(user)await loadCloud();else cloudBadge("warn","Not signed in");sb.auth.onAuthStateChange(async(_,session)=>{user=session?.user||null;cloudReady=false;renderAuth();if(user)await loadCloud();else cloudBadge("warn","Not signed in")})}
$("signInBtn").onclick=async()=>{const email=$("authEmail").value.trim(),password=$("authPassword").value;const {error}=await sb.auth.signInWithPassword({email,password});$("cloudMsg").textContent=error?error.message:"Signed in."};
$("signUpBtn").onclick=async()=>{const email=$("authEmail").value.trim(),password=$("authPassword").value;if(password.length<6)return $("cloudMsg").textContent="Use at least 6 characters.";const {error}=await sb.auth.signUp({email,password});$("cloudMsg").textContent=error?error.message:"Account created."};
$("signOutBtn").onclick=()=>sb.auth.signOut();$("syncBtn").onclick=uploadCloud;
window.addEventListener("focus",()=>{if(user)loadCloud().catch(()=>{})});document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&user)loadCloud().catch(()=>{})});

$("exportBtn").onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="money-tracker-v5-backup.json";a.click()};
$("importBtn").onclick=()=>$("importFile").click();
$("importFile").onchange=async e=>{try{const x=JSON.parse(await e.target.files[0].text());if(!Array.isArray(x.accounts)||!Array.isArray(x.categories))throw 0;state=x;save()}catch(err){alert("Invalid backup")}e.target.value=""};

if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js");
render();initAuth();