import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Browser-safe Supabase project URL and publishable key. Do not put a secret/service_role key here.
const SUPABASE_URL = 'https://omcaaglhfflypfwowmsb.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_yTFCZpEcwLPJRkdy6s4k-g_Ljxb8Qbu';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const MODELS = ['Retreat = CP320D','Cove = CP430','Lagoon = CP540','Horizon = CP800','Oasis = Oasis'];
const STATUSES = ['Advance Paid – Under Production','Production Completed – Waiting for Booking','Booked – Waiting to Pick Up','Loaded and Sent to Port','Sailed from POL – In Transit','Landed at POD','Delivered at Showroom – Closed'];
const $ = id => document.getElementById(id);
let orders = [], editingId = null, session = null, selectedId = null;
$('status').innerHTML = STATUSES.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');

function escapeHtml(value='') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function dateAdd(date, days) { if (!date) return ''; const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate()+days); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function money(value) { return Number(value || 0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function showMessage(message, isError=false, target='appMessage') { const el=$(target); el.textContent=message||''; el.className=`message ${message?(isError?'error':'success'):''}`; }
function normalize(order, products=[]) { return {id:order.id, poNo:order.po_number, supplier:order.supplier||'', advance:order.advance_amount??0, advanceDate:order.advance_date||'', targetDate:order.target_completion_date||'', actualDate:order.actual_completion_date||'', invoice:order.invoice_value??0, ddp:order.ddp_value??0, landing:order.landing_cost??0, container:order.container_number||'', booking:order.booking_date||'', sailing:order.sailing_date||'', eta:order.eta_date||'', status:order.status, notes:order.notes||'', models:products.map(p=>({model:p.model_name,qty:p.quantity}))}; }
function statusClass(status) { if (status===STATUSES[6]) return 'status closed'; if (status===STATUSES[4]||status===STATUSES[5]) return 'status transit'; if (status===STATUSES[0]||status===STATUSES[1]) return 'status production'; return 'status'; }

async function loadOrders() {
  showMessage('Loading purchase orders…');
  const {data:poData,error:poError}=await supabase.from('purchase_orders').select('*').order('created_at',{ascending:false});
  if(poError){showMessage(`${poError.message}. Confirm the SQL access policies have been applied.`,true);return;}
  const ids=(poData||[]).map(p=>p.id); let productData=[];
  if(ids.length){const {data,error}=await supabase.from('purchase_order_products').select('*').in('purchase_order_id',ids);if(error){showMessage(error.message,true);return;}productData=data||[];}
  orders=(poData||[]).map(p=>normalize(p,productData.filter(x=>x.purchase_order_id===p.id)));
  if(!orders.some(o=>o.id===selectedId)) selectedId=orders[0]?.id||null;
  showMessage(''); render();
}
function render() {
  const q=$('search').value.trim().toLowerCase();
  const filtered=orders.filter(o=>JSON.stringify(o).toLowerCase().includes(q));
  $('rows').innerHTML=filtered.map(o=>`<tr class="${selectedId===o.id?'selected-row':''}" data-select="${o.id}"><td class="po">${escapeHtml(o.poNo)}</td><td>${escapeHtml(o.supplier||'—')}</td><td>${o.models.map(m=>`${escapeHtml(m.model)} × ${m.qty}`).join('<br>')||'—'}</td><td>${money(o.advance)}</td><td>${escapeHtml(o.advanceDate||'—')}</td><td>${escapeHtml(o.targetDate||'—')}</td><td>${escapeHtml(o.actualDate||'—')}</td><td>${money(o.invoice)}</td><td>${money(o.ddp)}</td><td><b>${money(Number(o.invoice||0)+Number(o.ddp||0))}</b></td><td>${escapeHtml(o.container||'—')}</td><td>${escapeHtml(o.booking||'—')}</td><td>${escapeHtml(o.sailing||'—')}</td><td>${escapeHtml(o.eta||'—')}</td><td><span class="${statusClass(o.status)}">${escapeHtml(o.status)}</span></td><td><div class="row-actions"><button class="tiny secondary" data-edit="${o.id}">Edit</button><button class="tiny danger" data-delete="${o.id}">Delete</button></div></td></tr>`).join('');
  $('total').textContent=orders.length;
  $('production').textContent=orders.filter(o=>o.status===STATUSES[0]||o.status===STATUSES[1]).length;
  $('transit').textContent=orders.filter(o=>o.status===STATUSES[4]||o.status===STATUSES[5]).length;
  $('closed').textContent=orders.filter(o=>o.status===STATUSES[6]).length;
  const pod=$('atPod'); if(pod) pod.textContent=orders.filter(o=>o.status===STATUSES[5]).length;
  $('rows').querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();editOrder(b.dataset.edit);}));
  $('rows').querySelectorAll('[data-delete]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();deleteOrder(b.dataset.delete);}));
  $('rows').querySelectorAll('[data-select]').forEach(r=>r.addEventListener('click',()=>{selectedId=r.dataset.select;render();renderDetail();}));
  if(!selectedId && orders.length) selectedId=orders[0].id;
  renderDetail();
}
function renderDetail(){
  const o=orders.find(x=>x.id===selectedId);
  const left=$('detailSummary'), timeline=$('timeline'), current=$('currentStatus'), dates=$('keyDates');
  if(!left||!timeline||!current||!dates)return;
  if(!o){left.innerHTML='<h2>Select a purchase order</h2><p>No selection</p><p>Choose a row above to see the shipment timeline and key dates.</p>';timeline.innerHTML='<p>Select a purchase order to view progress.</p>';current.textContent='Select a purchase order to view progress.';dates.innerHTML='<p>No purchase order selected.</p>';return;}
  left.innerHTML=`<h2>${escapeHtml(o.poNo)} <span class="${statusClass(o.status)}">${escapeHtml(o.status)}</span></h2>
    <p>♙ <b>Supplier:</b> ${escapeHtml(o.supplier||'—')}</p>
    <p>▣ <b>Product:</b> ${o.models.map(m=>`${escapeHtml(m.model)} × ${m.qty}`).join(', ')||'—'}</p>
    <p>◷ <b>Advance:</b> USD ${money(o.advance)} (${escapeHtml(o.advanceDate||'—')})</p>
    <p>◉ <b>Target Completion:</b> ${escapeHtml(o.targetDate||'—')}</p>
    <p>✓ <b>Actual Completion:</b> ${escapeHtml(o.actualDate||'—')}</p>
    <p>$ <b>Invoice Value:</b> USD ${money(o.invoice)}</p>
    <p>$ <b>DDP Value:</b> USD ${money(o.ddp)}</p>
    <p>▤ <b>Container No.:</b> ${escapeHtml(o.container||'—')}</p>`;
  const currentIndex=Math.max(0,STATUSES.indexOf(o.status));
  timeline.innerHTML=STATUSES.map((s,i)=>`<div class="milestone ${i<currentIndex?'done':i===currentIndex?'active':''}"><span class="milestone-dot">${i<currentIndex?'✓':i===currentIndex?'●':'○'}</span><b>${escapeHtml(s)}</b><small>${escapeHtml([o.advanceDate,'',o.actualDate,o.booking,o.booking,o.sailing,o.eta][i]||'')}</small></div>`).join('');
  current.textContent=`Current Status: ${o.status}. ${o.sailing?'Sailed from POL on '+o.sailing+'. ':''}${o.eta?'ETA at POD: '+o.eta+'.':''}`;
  dates.innerHTML=`<div><span>Booking Date</span><b>${escapeHtml(o.booking||'—')}</b></div><div><span>Sailing Date</span><b>${escapeHtml(o.sailing||'—')}</b></div><div><span>ETA (POD)</span><b>${escapeHtml(o.eta||'—')}</b></div>`;
}

function addModel(model='',qty=1) { const div=document.createElement('div');div.className='model-row';div.innerHTML=`<select aria-label="Pool model">${MODELS.map(m=>`<option value="${escapeHtml(m)}" ${m===model?'selected':''}>${escapeHtml(m)}</option>`).join('')}</select><input type="number" min="1" step="1" value="${Math.max(1,Number(qty)||1)}" aria-label="Quantity"><button type="button" class="remove" aria-label="Remove model">×</button>`;div.querySelector('.remove').onclick=()=>div.remove();$('models').append(div); }
function calc(){ $('targetDate').value=dateAdd($('advanceDate').value,35);$('landing').value=money(Number($('invoice').value||0)+Number($('ddp').value||0)); }
function clearForm(){ $('poForm').reset();$('models').innerHTML='';addModel();$('status').value=STATUSES[0];$('poNo').value='Assigned on save';calc(); }
function openNew(){editingId=null;clearForm();$('formTitle').textContent='New purchase order';$('editor').showModal();}
function editOrder(id){const o=orders.find(x=>x.id===id);if(!o)return;editingId=id;clearForm();$('formTitle').textContent=`Edit ${o.poNo}`;const fields={supplier:o.supplier,advance:o.advance,advanceDate:o.advanceDate, targetDate:o.targetDate,actualDate:o.actualDate,invoice:o.invoice,ddp:o.ddp,container:o.container,booking:o.booking,sailing:o.sailing,eta:o.eta,status:o.status,notes:o.notes,poNo:o.poNo};Object.entries(fields).forEach(([k,v])=>$(k).value=v??'');$('models').innerHTML='';(o.models||[]).forEach(m=>addModel(m.model,m.qty));calc();$('editor').showModal(); }
async function deleteOrder(id){const o=orders.find(x=>x.id===id);if(!o||!confirm(`Delete ${o.poNo}? This cannot be undone.`))return;showMessage('Deleting…');const {error}=await supabase.from('purchase_orders').delete().eq('id',id);if(error){showMessage(error.message,true);return;}showMessage(`${o.poNo} deleted.`);await loadOrders();}
function formPayload(){return {supplier:$('supplier').value.trim()||null,advance_amount:Number($('advance').value||0),advance_date:$('advanceDate').value||null,actual_completion_date:$('actualDate').value||null,invoice_value:Number($('invoice').value||0),ddp_value:Number($('ddp').value||0),container_number:$('container').value.trim()||null,booking_date:$('booking').value||null,sailing_date:$('sailing').value||null,eta_date:$('eta').value||null,status:$('status').value,notes:$('notes').value.trim()||null};}
function productsPayload(poId){return [...$('models').querySelectorAll('.model-row')].map(row=>({purchase_order_id:poId,model_name:row.querySelector('select').value,quantity:Math.max(1,parseInt(row.querySelector('input').value,10)||1)}));}
async function saveOrder(event){event.preventDefault();$('saveButton').disabled=true;$('saveButton').textContent='Saving…';showMessage('Saving purchase order…');try{const payload=formPayload();let poId=editingId;let poNumber='';if(editingId){const {data,error}=await supabase.from('purchase_orders').update(payload).eq('id',editingId).select('id,po_number').single();if(error)throw error;poNumber=data.po_number;const del=await supabase.from('purchase_order_products').delete().eq('purchase_order_id',editingId);if(del.error)throw del.error;}else{const {data,error}=await supabase.from('purchase_orders').insert(payload).select('id,po_number').single();if(error)throw error;poId=data.id;poNumber=data.po_number;}
const products=productsPayload(poId);if(products.length){const {error}=await supabase.from('purchase_order_products').insert(products);if(error)throw new Error(`PO ${poNumber} was saved, but its pool model list failed: ${error.message}`);} $('editor').close();showMessage(`${poNumber} saved to Supabase.`);await loadOrders();}catch(error){showMessage(error.message||'Unable to save the purchase order.',true);}finally{$('saveButton').disabled=false;$('saveButton').textContent='Save purchase order';}}
function exportCsv(){const headers=['PO Number','Supplier','Models','Advance Amount','Advance Date','Target Completion','Actual Completion','Invoice Value USD','DDP Value USD','Landing Cost USD','Container','Booking Date','Sailing Date','ETA','Status','Notes'];const rows=orders.map(o=>[o.poNo,o.supplier,o.models.map(m=>`${m.model} x ${m.qty}`).join('; '),o.advance,o.advanceDate,o.targetDate,o.actualDate,o.invoice,o.ddp,Number(o.invoice||0)+Number(o.ddp||0),o.container,o.booking,o.sailing,o.eta,o.status,o.notes]);const csv=[headers,...rows].map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='BPGP_Purchase_Orders.csv';a.click();URL.revokeObjectURL(url);}
async function showApp(currentSession){session=currentSession;$('loginView').classList.toggle('hidden',!!session);$('appView').classList.toggle('hidden',!session);$('signOut').classList.toggle('hidden',!session);$('userEmail').textContent=session?.user?.email||'';if(session)await loadOrders();}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginButton').disabled=true;$('loginMessage').textContent='Signing in…';const {data,error}=await supabase.auth.signInWithPassword({email:$('loginEmail').value.trim(),password:$('loginPassword').value});$('loginButton').disabled=false;if(error){$('loginMessage').textContent=error.message;$('loginMessage').className='message error';return;}$('loginMessage').textContent='';await showApp(data.session);});
$('signOut').onclick=async()=>{await supabase.auth.signOut();orders=[];await showApp(null);};
$('newBtn').onclick=openNew;$('close').onclick=$('cancel').onclick=()=>$('editor').close();$('search').oninput=render;$('refreshBtn').onclick=loadOrders;$('exportBtn').onclick=exportCsv;$('addModel').onclick=()=>addModel();$('poForm').addEventListener('submit',saveOrder);$('refreshBtn2')?.addEventListener('click',loadOrders);$('editSelected')?.addEventListener('click',()=>selectedId&&editOrder(selectedId));$('addUpdate')?.addEventListener('click',()=>selectedId&&editOrder(selectedId));['advanceDate','invoice','ddp'].forEach(id=>$(id).addEventListener('input',calc));
supabase.auth.onAuthStateChange((_event,newSession)=>{session=newSession;showApp(newSession);});
const {data:{session:initialSession}}=await supabase.auth.getSession();await showApp(initialSession);
