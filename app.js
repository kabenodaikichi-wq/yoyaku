/* Reservation app (localStorage). iPad landscape first. */
const STORAGE_KEY = "yoyaku_v1";

const $ = (sel) => document.querySelector(sel);

const calendarGrid = $("#calendarGrid");
const monthTitle = $("#monthTitle");
const selectedDateBadge = $("#selectedDateBadge");
const rightSub = $("#rightSub");
const stickiesEl = $("#stickies");
const emptyState = $("#emptyState");

const memoTextarea = $("#dayMemo");
const memoHint = $("#memoHint");

const prevMonthBtn = $("#prevMonthBtn");
const nextMonthBtn = $("#nextMonthBtn");
const todayBtn = $("#todayBtn");
const newBtn = $("#newBtn");

/* modal + form */
const modal = $("#modal");
const modalBackdrop = $("#modalBackdrop");
const closeModalBtn = $("#closeModalBtn");
const cancelBtn = $("#cancelBtn");
const deleteBtn = $("#deleteBtn");
const reservationForm = $("#reservationForm");

const formDate = $("#formDate");
const formTime = $("#formTime");
const formName = $("#formName");
const formPhone = $("#formPhone");
const formPeople = $("#formPeople");
const formNote = $("#formNote");
const nameSuggestions = $("#nameSuggestions");

const pad2 = (n) => String(n).padStart(2, "0");
const toISODate = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const parseISODate = (iso) => {
  const [y,m,dd] = iso.split("-").map(Number);
  return new Date(y, m-1, dd);
};
const jaDateLabel = (iso) => {
  const d = parseISODate(iso);
  const youbi = ["日","月","火","水","木","金","土"][d.getDay()];
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日（${youbi}）`;
};

/** State */
let db = loadDB();
let viewMonth = new Date(); // any day in month
let selectedDate = toISODate(new Date());
let editingId = null;

init();

function init(){
  // set month to selectedDate's month initially
  viewMonth = parseISODate(selectedDate);

  buildTimeOptions();
  buildPeopleOptions();
  refreshSuggestions();

  renderAll();

  // Events
  prevMonthBtn.addEventListener("click", () => { shiftMonth(-1); });
  nextMonthBtn.addEventListener("click", () => { shiftMonth(+1); });
  todayBtn.addEventListener("click", () => {
    selectedDate = toISODate(new Date());
    viewMonth = parseISODate(selectedDate);
    renderAll();
  });

  newBtn.addEventListener("click", () => openModalForNew(selectedDate));

  memoTextarea.addEventListener("input", debounce(() => {
    const memo = memoTextarea.value;
    db.memos[selectedDate] = memo;
    saveDB();
    memoHint.textContent = "保存しました";
    setTimeout(() => { if (memoHint.textContent === "保存しました") memoHint.textContent = ""; }, 1000);
  }, 450));

  modalBackdrop.addEventListener("click", closeModal);
  closeModalBtn.addEventListener("click", closeModal);
  cancelBtn.addEventListener("click", closeModal);

  reservationForm.addEventListener("submit", (e) => {
    e.preventDefault();
    onSaveReservation();
  });

  deleteBtn.addEventListener("click", () => {
    if (!editingId) return;
    const ok = confirm("この予約を削除しますか？");
    if (!ok) return;
    db.reservations = db.reservations.filter(r => r.id !== editingId);
    saveDB();
    closeModal();
    renderRight();
    renderCalendar(); // dot update
    refreshSuggestions();
  });
}

function renderAll(){
  selectedDateBadge.textContent = jaDateLabel(selectedDate);
  renderCalendar();
  renderMemo();
  renderRight();
}

/* Calendar */
function shiftMonth(delta){
  const d = new Date(viewMonth.getFullYear(), viewMonth.getMonth()+delta, 1);
  viewMonth = d;
  renderCalendar();
}

function renderCalendar(){
  const y = viewMonth.getFullYear();
  const m = viewMonth.getMonth(); // 0-11
  monthTitle.textContent = `${y}年 ${m+1}月`;

  calendarGrid.innerHTML = "";

  const first = new Date(y, m, 1);
  const startDay = first.getDay(); // 0 Sun
  const daysInMonth = new Date(y, m+1, 0).getDate();

  // Determine previous month tail
  const prevDays = new Date(y, m, 0).getDate();

  // total cells: 6 weeks x 7 = 42 for stable grid on iPad
  const totalCells = 42;

  const todayISO = toISODate(new Date());

  for (let i=0; i<totalCells; i++){
    const cell = document.createElement("div");
    cell.className = "day";

    let dayNum, cellDate;
    if (i < startDay){
      dayNum = prevDays - (startDay - 1 - i);
      cell.classList.add("out");
      cellDate = new Date(y, m-1, dayNum);
    } else if (i >= startDay + daysInMonth){
      dayNum = (i - (startDay + daysInMonth)) + 1;
      cell.classList.add("out");
      cellDate = new Date(y, m+1, dayNum);
    } else {
      dayNum = (i - startDay) + 1;
      cellDate = new Date(y, m, dayNum);
    }

    const iso = toISODate(cellDate);

    const num = document.createElement("div");
    num.className = "num";
    num.textContent = String(dayNum);

    const dot = document.createElement("div");
    dot.className = "dot";

    cell.appendChild(num);
    cell.appendChild(dot);

    // flags
    if (iso === todayISO) cell.classList.add("today");
    if (iso === selectedDate) cell.classList.add("selected");
    if (hasReservation(iso)) cell.classList.add("has");

    cell.addEventListener("click", () => {
      selectedDate = iso;
      // if tapped out-of-month, jump viewMonth to that month
      viewMonth = new Date(cellDate.getFullYear(), cellDate.getMonth(), 1);
      renderAll();
      // open modal quickly if user wants: (optional)
      // openModalForNew(selectedDate);
    });

    calendarGrid.appendChild(cell);
  }
}

function hasReservation(iso){
  return db.reservations.some(r => r.date === iso);
}

/* Memo */
function renderMemo(){
  memoTextarea.value = db.memos[selectedDate] ?? "";
  memoHint.textContent = "";
}

/* Right side (stickies) */
function renderRight(){
  const list = db.reservations
    .filter(r => r.date === selectedDate)
    .sort((a,b) => a.time.localeCompare(b.time));

  rightSub.textContent = `${list.length}件`;

  stickiesEl.innerHTML = "";
  if (list.length === 0){
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  // Two-column grid; 4 stickies visible nicely; beyond that scroll within stickies area
  for (const r of list){
    const card = document.createElement("div");
    card.className = "sticky";
    card.setAttribute("role","button");
    card.setAttribute("tabindex","0");

    const time = document.createElement("div");
    time.className = "time";
    time.textContent = r.time;

    const main = document.createElement("div");
    main.className = "main";

    const people = document.createElement("span");
    people.textContent = `${r.people}名`;

    const name = document.createElement("span");
    name.textContent = r.name;

    main.appendChild(people);
    main.appendChild(name);

    const sub = document.createElement("div");
    sub.className = "sub";

    if (r.phone){
      const ph = document.createElement("div");
      ph.textContent = formatPhone(r.phone);
      sub.appendChild(ph);
    } else {
      const ph = document.createElement("div");
      ph.innerHTML = `<span class="pill">電話 未入力</span>`;
      sub.appendChild(ph);
    }

    if (r.note){
      const note = document.createElement("div");
      note.textContent = r.note;
      sub.appendChild(note);
    }

    card.appendChild(time);
    card.appendChild(main);
    card.appendChild(sub);

    card.addEventListener("click", () => openModalForEdit(r.id));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") openModalForEdit(r.id);
    });

    stickiesEl.appendChild(card);
  }
}

/* Modal helpers */
function openModalForNew(dateISO){
  editingId = null;
  deleteBtn.hidden = true;

  $("#modalTitle").textContent = "予約入力";
  formDate.value = dateISO;
  formTime.value = nearestTimeOption();
  formName.value = "";
  formPhone.value = "";
  formPeople.value = "2";
  formNote.value = "";

  showModal();
  setTimeout(() => formName.focus(), 60);
}

function openModalForEdit(id){
  const r = db.reservations.find(x => x.id === id);
  if (!r) return;

  editingId = id;
  deleteBtn.hidden = false;

  $("#modalTitle").textContent = "予約編集";
  formDate.value = r.date;
  formTime.value = r.time;
  formName.value = r.name;
  formPhone.value = r.phone ?? "";
  formPeople.value = String(r.people);
  formNote.value = r.note ?? "";

  showModal();
  setTimeout(() => formName.focus(), 60);
}

function showModal(){
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(){
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
}

/* Save reservation */
function onSaveReservation(){
  const date = formDate.value;
  const time = formTime.value;
  const name = formName.value.trim();
  const phone = normalizePhone(formPhone.value);
  const people = Number(formPeople.value);
  const note = formNote.value.trim();

  if (!date || !time || !name || !people){
    alert("日付・時刻・名前・人数は必須です。");
    return;
  }

  if (editingId){
    const idx = db.reservations.findIndex(r => r.id === editingId);
    if (idx === -1) return;
    db.reservations[idx] = {
      ...db.reservations[idx],
      date, time, name, phone, people, note,
      updatedAt: Date.now()
    };
  } else {
    const r = {
      id: cryptoId(),
      date, time, name, phone, people, note,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    db.reservations.push(r);
  }

  // keep view + selection synced
  selectedDate = date;
  viewMonth = parseISODate(selectedDate);

  // update customers list for suggestions
  touchCustomer(name, phone);

  saveDB();
  closeModal();
  renderAll();
  refreshSuggestions();
}

/* Suggestions */
function refreshSuggestions(){
  // Build datalist from customers list (most recent first)
  const customers = Object.values(db.customers)
    .sort((a,b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))
    .slice(0, 30);

  nameSuggestions.innerHTML = "";
  for (const c of customers){
    const opt = document.createElement("option");
    opt.value = c.name;
    nameSuggestions.appendChild(opt);
  }

  // optional: when name matches exactly, auto-fill phone
  formName.addEventListener("change", () => {
    const v = formName.value.trim();
    const c = db.customers[v];
    if (c && c.phone && !formPhone.value) formPhone.value = c.phone;
  }, { once:false });
}

function touchCustomer(name, phone){
  if (!name) return;
  const key = name;
  const cur = db.customers[key] ?? { name: key, phone: "" };
  db.customers[key] = {
    ...cur,
    phone: phone || cur.phone || "",
    lastUsedAt: Date.now()
  };
}

/* Options */
function buildTimeOptions(){
  formTime.innerHTML = "";
  // 30-min increments
  for (let h=15; h<=23; h++){
    for (const mm of [0,30]){
      const t = `${pad2(h)}:${pad2(mm)}`;
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      formTime.appendChild(opt);
    }
  }
  // add early slots too (just in case)
  for (let h=0; h<15; h++){
    for (const mm of [0,30]){
      const t = `${pad2(h)}:${pad2(mm)}`;
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      formTime.appendChild(opt);
    }
  }
  // sort time list
  const opts = Array.from(formTime.querySelectorAll("option"))
    .sort((a,b) => a.value.localeCompare(b.value));
  formTime.innerHTML = "";
  opts.forEach(o => formTime.appendChild(o));
}

function nearestTimeOption(){
  const now = new Date();
  const minutes = now.getHours()*60 + now.getMinutes();
  const rounded = Math.ceil(minutes / 30) * 30;
  const h = Math.floor(rounded / 60) % 24;
  const m = rounded % 60;
  const t = `${pad2(h)}:${pad2(m)}`;
  // if not exist, fallback
  return Array.from(formTime.options).some(o => o.value === t) ? t : "18:00";
}

function buildPeopleOptions(){
  formPeople.innerHTML = "";
  for (let i=1;i<=8;i++){
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${i}名`;
    formPeople.appendChild(opt);
  }
  formPeople.value = "2";
}

/* Storage */
function loadDB(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshDB();
    const obj = JSON.parse(raw);
    // basic shape
    return {
      reservations: Array.isArray(obj.reservations) ? obj.reservations : [],
      memos: obj.memos && typeof obj.memos === "object" ? obj.memos : {},
      customers: obj.customers && typeof obj.customers === "object" ? obj.customers : {}
    };
  } catch {
    return freshDB();
  }
}

function saveDB(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function freshDB(){
  return { reservations: [], memos: {}, customers: {} };
}

/* Utils */
function debounce(fn, wait){
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function cryptoId(){
  // Good enough unique id for local storage
  return (crypto?.randomUUID?.() ?? `id_${Math.random().toString(16).slice(2)}_${Date.now()}`);
}

function normalizePhone(v){
  const s = (v ?? "").toString().trim();
  if (!s) return "";
  // keep digits only
  const digits = s.replace(/[^\d]/g, "");
  return digits;
}

function formatPhone(digits){
  const s = (digits ?? "").replace(/[^\d]/g, "");
  if (s.length === 11) return `${s.slice(0,3)}-${s.slice(3,7)}-${s.slice(7)}`;
  if (s.length === 10) return `${s.slice(0,2)}-${s.slice(2,6)}-${s.slice(6)}`;
  return s;
}
