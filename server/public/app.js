const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

const api = {
  async list(start, end) {
    const r = await fetch(`/api/tasks?start=${start}&end=${end}`);
    return r.json();
  },
  async create(payload) {
    const r = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return r.json();
  },
  async update(id, payload) {
    const r = await fetch(`/api/tasks/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return r.json();
  },
  async remove(id) {
    const r = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    return r.json();
  },
  async removeImage(id, src) {
    const r = await fetch(`/api/tasks/${id}/image?src=${encodeURIComponent(src)}`, { method: 'DELETE' });
    return r.json();
  },
};

const state = {
  view: 'day',
  base: new Date(),
  filters: new Set(['todo','doing','done']),
};

function showLightbox(src){
  const lb = document.getElementById('lightbox');
  const lbImg = document.getElementById('lightbox_img');
  if(lb && lbImg){ lbImg.src = src; lb.classList.add('show'); }
}

function fmtDate(d) { return d.toISOString().slice(0,10); }
function startOfWeek(d) { const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; }
function endOfWeek(d) { const x=startOfWeek(d); x.setDate(x.getDate()+6); return x; }
function startOfMonth(d) { const x=new Date(d.getFullYear(), d.getMonth(), 1); return x; }
function endOfMonth(d) { const x=new Date(d.getFullYear(), d.getMonth()+1, 0); return x; }

// 'YYYY-MM-DD' -> 'YYYY-M-D'
function fmtCompactDateStr(s){
  if(!s) return '';
  const parts = String(s).split('-').map(Number);
  if(parts.length!==3 || parts.some(isNaN)) return s;
  const [y,m,d] = parts;
  return `${y}-${m}-${d}`;
}

// Epoch-day helpers for stable day diff (timezone-safe)
function toEpochDay(s){
  if(!s) return NaN;
  const [y,m,d] = String(s).split('-').map(Number);
  if(!y || !m || !d) return NaN;
  return Date.UTC(y, m-1, d) / 86400000;
}

function todayYMD(){
  const t = new Date();
  return t.toISOString().slice(0,10);
}

function currentRange(){
  const b = state.base;
  if(state.view==='day') return [fmtDate(b), fmtDate(b)];
  if(state.view==='week') return [fmtDate(startOfWeek(b)), fmtDate(endOfWeek(b))];
  return [fmtDate(startOfMonth(b)), fmtDate(endOfMonth(b))];
}

function updateLabel(){
  const b=state.base;
  const label=$('#current-label');
  if(state.view==='day') label.textContent = b.toLocaleDateString('ko-KR', { dateStyle:'long' });
  if(state.view==='week') {
    const s=startOfWeek(b), e=endOfWeek(b);
    label.textContent = `${s.toLocaleDateString('ko-KR', { month:'long', day:'numeric'})} ~ ${e.toLocaleDateString('ko-KR', { month:'long', day:'numeric'})}`;
  }
  if(state.view==='month') label.textContent = b.toLocaleDateString('ko-KR', { year:'numeric', month:'long' });
}

async function refresh(){
  updateLabel();
  const [start, end] = currentRange();
  const data = await api.list(start, end);
  renderList(data);
}

function renderList(items){
  const list = $('#list');
  list.innerHTML = '';
  const filtered = items.filter(x => state.filters.has(x.status));
  if(!filtered.length){ list.innerHTML = '<div class="muted">데이터가 없습니다.</div>'; return; }
  const statusText = (s)=> s==='doing' ? '진행중' : (s==='done' ? '완료' : '예정');
  const order = { doing: 0, todo: 1, done: 2 };
  const sorted = filtered.slice().sort((a,b)=>{
    const byStatus = (order[a.status] ?? 9) - (order[b.status] ?? 9);
    if(byStatus!==0) return byStatus;
    const byDate = String(a.task_date).localeCompare(String(b.task_date));
    if(byDate!==0) return byDate;
    return (a.id||0) - (b.id||0);
  });
  sorted.forEach(item => {
    const div = document.createElement('div');
    div.className = `item ${item.status}`;
    const dateLine = (()=>{
      const startStr = fmtCompactDateStr(item.task_date);
      const endStr = item.completed_date ? fmtCompactDateStr(item.completed_date) : null;
      const startDay = toEpochDay(item.task_date);
      const endDay = endStr ? toEpochDay(item.completed_date) : NaN;
      if(endStr){
        const diff = (isNaN(startDay)||isNaN(endDay)) ? '' : ` (D+${Math.max(0, endDay - startDay)})`;
        return `${startStr} ~ ${endStr}${diff}`;
      }
      if(item.status==='doing'){
        const today = todayYMD();
        const todayDay = toEpochDay(today);
        const diff = (isNaN(startDay)||isNaN(todayDay)) ? '' : ` ~ ${fmtCompactDateStr(today)} (D-${Math.max(0, todayDay - startDay)})`;
        return `${startStr}${diff}`;
      }
      return startStr;
    })();
    const imagesHtml = (Array.isArray(item.images) && item.images.length)
      ? (`<div class="thumbs">` + item.images.map((src)=>('<div class="thumb"><img src="'+src+'" alt="image" /><button class="mini danger mini-del" data-src="'+src+'">삭제</button></div>')).join('') + `</div>`)
      : (item.image_path ? (`<div class="thumbs"><div class="thumb"><img src="${item.image_path}" alt="image" /><button class="mini danger mini-del" data-src="${item.image_path}">삭제</button></div></div>`) : '');
    div.innerHTML = `
      <div class="top">
        <strong>${item.title}</strong>
        <span class="badge ${item.status}">${statusText(item.status)}</span>
      </div>
      <div class="meta">${dateLine}</div>
      ${imagesHtml}
      <div class="muted">${(item.note||'').replace(/</g,'&lt;')}</div>
      <div class="row">
        <button data-act="set:todo">할 일</button>
        <button data-act="set:doing">진행중</button>
        <button data-act="set:done">완료</button>
        <button class="danger" data-act="del">삭제</button>
      </div>
    `;
    // open lightbox on image click
    div.querySelectorAll('.thumb img').forEach(img=>{
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', ()=> showLightbox(img.src));
    });
    div.addEventListener('click', async (e)=>{
      const b=e.target.closest('button'); if(!b) return;
      const act=b.dataset.act;
      if(act?.startsWith('set:')){
        const ns=act.split(':')[1];
        await api.update(item.id,{ status: ns });
        refresh();
      } else if(act==='del'){
        if(confirm('삭제하시겠습니까?')){ await api.remove(item.id); refresh(); }
      }
    });
    // mini delete buttons (per-image)
    div.querySelectorAll('.mini-del').forEach(btn=>{
      btn.addEventListener('click', async (e)=>{
        e.stopPropagation();
        const src = btn.getAttribute('data-src');
        if(!src) return;
        if(confirm('해당 이미지를 삭제하시겠습니까?')){
          await api.removeImage(item.id, src);
          refresh();
        }
      });
    });
    list.appendChild(div);
  });
}

function bindUI(){
  // tabs
  $$('.tab').forEach(t=>t.addEventListener('click',()=>{
    $$('.tab').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    state.view=t.dataset.view;
    refresh();
  }));

  // nav
  $('#prev').addEventListener('click',()=>{ shift(-1); });
  $('#next').addEventListener('click',()=>{ shift(1); });
  $('#today').addEventListener('click',()=>{ state.base=new Date(); refresh(); });

  // filters
  $$('#filters input[type="checkbox"]').forEach(chk=>{
    chk.addEventListener('change',()=>{
      if(chk.checked) state.filters.add(chk.value); else state.filters.delete(chk.value);
      refresh();
    });
  });

  // default date: today
  const taskDateInput = $('#task_date');
  if(taskDateInput && !taskDateInput.value){
    taskDateInput.value = fmtDate(new Date());
  }

  // image preview
  const imageInput = $('#image');
  const imagePreview = $('#image_preview');
  let selectedFiles = [];
  if(imageInput && imagePreview){
    const fileKey = (f) => `${f.name}|${f.size}|${f.lastModified}`;
    const setFiles = (files) => {
      selectedFiles = files;
      const dt = new DataTransfer();
      files.forEach(f=>dt.items.add(f));
      imageInput.files = dt.files;
    };
    const renderPreviews = () => {
      imagePreview.innerHTML = '';
      selectedFiles.slice(0,5).forEach((file)=>{
        const wrap = document.createElement('div');
        wrap.className = 'thumb';
        const img = new Image();
        const del = document.createElement('button');
        del.type = 'button';
        del.textContent = '삭제';
        del.className = 'mini danger';
        del.addEventListener('click', ()=>{
          const key = fileKey(file);
          const remaining = selectedFiles.filter(f=>fileKey(f)!==key);
          setFiles(remaining);
          renderPreviews();
        });
        const reader = new FileReader();
        reader.onload = () => { 
          img.src = reader.result; 
        };
        reader.onerror = () => { wrap.textContent = '미리보기 실패'; };
        reader.readAsDataURL(file);
        img.addEventListener('click', ()=>{
          const lb = document.getElementById('lightbox');
          const lbImg = document.getElementById('lightbox_img');
          if(lb && lbImg){ lbImg.src = img.src; lb.classList.add('show'); }
        });
        wrap.appendChild(img);
        wrap.appendChild(del);
        imagePreview.appendChild(wrap);
      });
    };
    imageInput.addEventListener('change', () => {
      const newlySelected = Array.from(imageInput.files || []);
      const map = new Map(selectedFiles.map(f=>[fileKey(f), f]));
      newlySelected.forEach(f=> map.set(fileKey(f), f));
      setFiles(Array.from(map.values()).slice(0,5));
      renderPreviews();
    });
  }

  // create form
  $('#create-form').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const title = $('#title').value.trim();
    const task_date = $('#task_date').value;
    const status = $('#status').value;
    const note = $('#note').value.trim()||'';
    const imageFiles = Array.from($('#image')?.files || []);
    if(!title || !task_date){ alert('제목과 날짜는 필수입니다.'); return; }

    const fd = new FormData();
    fd.append('title', title);
    fd.append('task_date', task_date);
    fd.append('status', status);
    if(note) fd.append('note', note);
    imageFiles.forEach((f)=> fd.append('images', f));

    const r = await fetch('/api/tasks', { method: 'POST', body: fd });
    if(!r.ok){ const err = await r.json().catch(()=>({error:'업로드 실패'})); alert(err.error||'업로드 실패'); return; }
    await r.json();
    e.target.reset();
    // reset date to today after reset
    const taskDateInput = $('#task_date');
    if(taskDateInput){ taskDateInput.value = fmtDate(new Date()); }
    if(imagePreview){ imagePreview.innerHTML = ''; }
    if(imageInput){ const dt = new DataTransfer(); imageInput.files = dt.files; selectedFiles = []; }
    refresh();
  });
}

function shift(n){
  const b=new Date(state.base);
  if(state.view==='day') b.setDate(b.getDate()+n);
  if(state.view==='week') b.setDate(b.getDate()+n*7);
  if(state.view==='month') b.setMonth(b.getMonth()+n);
  state.base=b; refresh();
}

// init
bindUI();
refresh();

// lightbox close on backdrop click or ESC
document.addEventListener('click', (e)=>{
  const lb = document.getElementById('lightbox');
  if(!lb) return;
  if(e.target===lb){ lb.classList.remove('show'); }
});
document.addEventListener('keydown', (e)=>{
  const lb = document.getElementById('lightbox');
  if(!lb) return;
  if(e.key==='Escape'){ lb.classList.remove('show'); }
});

// theme toggle
(()=>{
  const toggle = document.getElementById('theme-toggle');
  if(!toggle) return;
  const KEY = 'pref-theme';
  const apply = (mode)=>{
    if(mode==='light') document.documentElement.classList.add('light');
    else document.documentElement.classList.remove('light');
    toggle.textContent = mode==='light' ? '🌙' : '🌞';
  };
  const pref = localStorage.getItem(KEY) || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  apply(pref);
  toggle.addEventListener('click',()=>{
    const next = document.documentElement.classList.contains('light') ? 'dark' : 'light';
    localStorage.setItem(KEY, next);
    apply(next);
  });
})();