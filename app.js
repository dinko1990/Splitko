/* Splitko v2
   - Edit expenses (pencil -> edit mode)
   - Better PDF layout (no arrow glyphs)
   - Total trip expenses (UI + PDF)
*/

const state = {
  version: 2,
  event: { name: "", startDate: "", endDate: "" },
  people: [],
  expenses: []
};

let editingExpenseId = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const els = {
  jsonFileInput: $("#jsonFileInput"),
  exportJsonBtn: $("#exportJsonBtn"),
  exportPdfBtn: $("#exportPdfBtn"),

  eventName: $("#eventName"),
  startDate: $("#startDate"),
  endDate: $("#endDate"),

  totalExpenses: $("#totalExpenses"),

  addPersonForm: $("#addPersonForm"),
  personNameInput: $("#personNameInput"),
  peopleList: $("#peopleList"),

  expenseFormTitle: $("#expenseFormTitle"),
  expenseFormSub: $("#expenseFormSub"),
  editModeBadge: $("#editModeBadge"),

  expenseForm: $("#expenseForm"),
  expenseDesc: $("#expenseDesc"),
  expenseAmount: $("#expenseAmount"),
  expensePayer: $("#expensePayer"),
  expenseDate: $("#expenseDate"),
  participantsList: $("#participantsList"),
  selectAllBtn: $("#selectAllBtn"),
  selectNoneBtn: $("#selectNoneBtn"),

  cancelEditBtn: $("#cancelEditBtn"),
  saveExpenseBtn: $("#saveExpenseBtn"),

  expensesList: $("#expensesList"),
  balancesList: $("#balancesList"),
  settlementsList: $("#settlementsList"),
};

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function euro(n) {
  const v = Number(n || 0);
  return v.toLocaleString(undefined, { style: "currency", currency: "EUR" });
}

function clampMoney(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function totalTripExpenses() {
  return clampMoney(state.expenses.reduce((sum, ex) => sum + (Number(ex.amount) || 0), 0));
}

function getPersonName(id) {
  return state.people.find(p => p.id === id)?.name ?? "Unknown";
}

/* ---------- Rendering ---------- */

function render() {
  // event
  els.eventName.value = state.event.name || "";
  els.startDate.value = state.event.startDate || "";
  els.endDate.value = state.event.endDate || "";

  // total
  els.totalExpenses.textContent = euro(totalTripExpenses());

  renderPeople();
  renderExpenseFormPeople();
  renderExpenses();
  renderSummary();
  renderExpenseFormMode();
}

function renderExpenseFormMode() {
  const isEdit = Boolean(editingExpenseId);
  els.editModeBadge.hidden = !isEdit;
  els.cancelEditBtn.hidden = !isEdit;

  if (isEdit) {
    els.expenseFormTitle.textContent = "Edit Expense";
    els.expenseFormSub.textContent = "Update fields and click “Save changes”.";
    els.saveExpenseBtn.textContent = "Save changes";
  } else {
    els.expenseFormTitle.textContent = "Add Expense";
    els.expenseFormSub.textContent = "Create a new expense.";
    els.saveExpenseBtn.textContent = "Add expense";
  }
}

function renderPeople() {
  els.peopleList.innerHTML = "";
  if (state.people.length === 0) {
    els.peopleList.innerHTML = `<div class="item"><div class="itemMeta">No people yet. Add someone above.</div></div>`;
    return;
  }

  state.people.forEach(person => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `
      <span class="chipName">${escapeHtml(person.name)}</span>
      <button class="chipBtn" title="Remove">×</button>
    `;
    chip.querySelector("button").addEventListener("click", () => removePerson(person.id));
    els.peopleList.appendChild(chip);
  });
}

function renderExpenseFormPeople() {
  // payer select
  const currentPayer = els.expensePayer.value;
  els.expensePayer.innerHTML = "";

  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = state.people.length ? "Select payer…" : "Add people first…";
  els.expensePayer.appendChild(opt0);

  state.people.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    els.expensePayer.appendChild(opt);
  });

  // keep selection if possible
  if (currentPayer && state.people.some(p => p.id === currentPayer)) {
    els.expensePayer.value = currentPayer;
  }

  // participants
  const existingChecks = readParticipantsFromUI();
  els.participantsList.innerHTML = "";

  state.people.forEach(p => {
    const row = document.createElement("label");
    row.className = "participant";
    const checked = existingChecks.length
      ? existingChecks.includes(p.id)
      : true;

    row.innerHTML = `
      <input type="checkbox" data-person="${p.id}" ${checked ? "checked" : ""} />
      <span>${escapeHtml(p.name)}</span>
    `;
    els.participantsList.appendChild(row);
  });

  if (!els.expenseDate.value) {
    els.expenseDate.value = new Date().toISOString().slice(0, 10);
  }
}

function renderExpenses() {
  els.expensesList.innerHTML = "";

  if (state.expenses.length === 0) {
    els.expensesList.innerHTML = `<div class="item"><div class="itemMeta">No expenses yet.</div></div>`;
    return;
  }

  const sorted = [...state.expenses].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  sorted.forEach(ex => {
    const item = document.createElement("div");
    item.className = "item";

    const involvedNames = ex.participants.map(getPersonName).join(", ");

    item.innerHTML = `
      <div class="itemTop">
        <div>
          <div class="itemTitle">${escapeHtml(ex.desc || "Expense")}</div>
          <div class="itemMeta">
            ${ex.date ? escapeHtml(ex.date) : ""} • Paid by <b>${escapeHtml(getPersonName(ex.payerId))}</b> • Involved: ${escapeHtml(involvedNames)}
          </div>
        </div>
        <div class="itemActions">
          <div class="itemTitle">${euro(ex.amount)}</div>
          <button class="iconBtn" title="Edit">✏️</button>
          <button class="iconBtn" title="Delete">🗑</button>
        </div>
      </div>
    `;

    const [editBtn, delBtn] = item.querySelectorAll("button");

    editBtn.addEventListener("click", () => startEditExpense(ex.id));
    delBtn.addEventListener("click", () => {
      // if deleting currently-edited expense, exit edit mode
      if (editingExpenseId === ex.id) stopEditExpense();
      state.expenses = state.expenses.filter(e => e.id !== ex.id);
      render();
    });

    els.expensesList.appendChild(item);
  });
}

function renderSummary() {
  const { balances, settlements } = calculateAll();

  // balances
  els.balancesList.innerHTML = "";
  if (state.people.length === 0) {
    els.balancesList.innerHTML = `<div class="item"><div class="itemMeta">Add people to see balances.</div></div>`;
  } else {
    state.people.forEach(p => {
      const b = balances[p.id] ?? 0;
      const cls = b >= 0 ? "moneyPos" : "moneyNeg";
      const item = document.createElement("div");
      item.className = "item";
      item.innerHTML = `
        <div class="itemTop">
          <div class="itemTitle">${escapeHtml(p.name)}</div>
          <div class="${cls}">${euro(b)}</div>
        </div>
        <div class="itemMeta">${b >= 0 ? "Gets back" : "Owes"} ${euro(Math.abs(b))}</div>
      `;
      els.balancesList.appendChild(item);
    });
  }

  // settlements
  els.settlementsList.innerHTML = "";
  if (settlements.length === 0) {
    els.settlementsList.innerHTML = `<div class="item"><div class="itemMeta">Nothing to settle (or no expenses yet).</div></div>`;
  } else {
    settlements.forEach(s => {
      const item = document.createElement("div");
      item.className = "item";
      item.innerHTML = `
        <div class="itemTop">
          <div class="itemTitle">${escapeHtml(getPersonName(s.from))} pays ${escapeHtml(getPersonName(s.to))}</div>
          <div class="itemTitle">${euro(s.amount)}</div>
        </div>
        <div class="itemMeta">Payment to settle balances</div>
      `;
      els.settlementsList.appendChild(item);
    });
  }
}

/* ---------- Core math ---------- */

function calculateAll() {
  const balances = {};
  state.people.forEach(p => balances[p.id] = 0);

  for (const ex of state.expenses) {
    if (!ex || !ex.payerId || !Array.isArray(ex.participants) || ex.participants.length === 0) continue;

    const amount = clampMoney(ex.amount);
    if (!(amount > 0)) continue;

    const share = clampMoney(amount / ex.participants.length);

    // payer paid full
    balances[ex.payerId] = clampMoney((balances[ex.payerId] ?? 0) + amount);

    // participants owe share
    for (const pid of ex.participants) {
      balances[pid] = clampMoney((balances[pid] ?? 0) - share);
    }
  }

  return { balances, settlements: simplifyDebts(balances) };
}

function simplifyDebts(balances) {
  const eps = 0.01;
  const creditors = [];
  const debtors = [];

  Object.entries(balances).forEach(([pid, bal]) => {
    const b = clampMoney(bal);
    if (b > eps) creditors.push({ pid, amt: b });
    else if (b < -eps) debtors.push({ pid, amt: -b });
  });

  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);

  const res = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const pay = clampMoney(Math.min(d.amt, c.amt));

    if (pay > eps) {
      res.push({ from: d.pid, to: c.pid, amount: pay });
      d.amt = clampMoney(d.amt - pay);
      c.amt = clampMoney(c.amt - pay);
    }
    if (d.amt <= eps) i++;
    if (c.amt <= eps) j++;
  }
  return res;
}

/* ---------- Editing ---------- */

function startEditExpense(expenseId) {
  const ex = state.expenses.find(e => e.id === expenseId);
  if (!ex) return;

  editingExpenseId = expenseId;

  els.expenseDesc.value = ex.desc || "";
  els.expenseAmount.value = String(Number(ex.amount || 0));
  els.expensePayer.value = ex.payerId || "";
  els.expenseDate.value = ex.date || "";

  // set participants checkboxes
  $$("#participantsList input[type='checkbox']").forEach(c => {
    const pid = c.getAttribute("data-person");
    c.checked = ex.participants.includes(pid);
  });

  renderExpenseFormMode();

  // scroll to form for clarity (mobile-friendly)
  els.expenseDesc.scrollIntoView({ behavior: "smooth", block: "center" });
}

function stopEditExpense() {
  editingExpenseId = null;
  clearExpenseForm();
  renderExpenseFormMode();
}

function clearExpenseForm() {
  els.expenseDesc.value = "";
  els.expenseAmount.value = "";
  // payer stays as-is (often convenient), but you can reset if you want:
  // els.expensePayer.value = "";
  if (!els.expenseDate.value) {
    els.expenseDate.value = new Date().toISOString().slice(0, 10);
  }
  $$("#participantsList input[type='checkbox']").forEach(c => c.checked = true);
}

/* ---------- Actions ---------- */

function addPerson(name) {
  const clean = (name || "").trim();
  if (!clean) return;

  state.people.push({ id: uid("p"), name: clean });
  render();
}

function removePerson(personId) {
  state.people = state.people.filter(p => p.id !== personId);

  state.expenses = state.expenses
    .filter(ex => ex.payerId !== personId)
    .map(ex => ({ ...ex, participants: ex.participants.filter(pid => pid !== personId) }))
    .filter(ex => ex.participants.length > 0);

  if (editingExpenseId) {
    const stillExists = state.expenses.some(e => e.id === editingExpenseId);
    if (!stillExists) editingExpenseId = null;
  }

  render();
}

function readParticipantsFromUI() {
  const checks = $$("#participantsList input[type='checkbox']");
  return checks.filter(c => c.checked).map(c => c.getAttribute("data-person"));
}

/* ---------- Import/Export JSON ---------- */

function exportJson() {
  const data = JSON.stringify(state, null, 2);
  downloadBlob(data, "application/json", fileNameSafe(`${state.event.name || "event"}_splitko.json`));
}

function importJsonFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(String(reader.result || ""));
      if (!obj || typeof obj !== "object") throw new Error("Invalid JSON");

      editingExpenseId = null;

      state.version = obj.version ?? 2;
      state.event = obj.event ?? { name: "", startDate: "", endDate: "" };
      state.people = Array.isArray(obj.people) ? obj.people : [];
      state.expenses = Array.isArray(obj.expenses) ? obj.expenses : [];

      // normalize
      state.people = state.people.map(p => ({
        id: p.id || uid("p"),
        name: String(p.name || "").trim() || "Unnamed"
      }));

      state.expenses = state.expenses.map(ex => ({
        id: ex.id || uid("e"),
        desc: String(ex.desc || ""),
        amount: Number(ex.amount || 0),
        payerId: String(ex.payerId || ""),
        date: String(ex.date || ""),
        participants: Array.isArray(ex.participants) ? ex.participants.map(String) : []
      })).filter(ex => ex.payerId);

      render();
    } catch (err) {
      alert("Could not load JSON: " + (err?.message || err));
    }
  };
  reader.readAsText(file);
}

async function loadDbFromFile() {
  try {
    const response = await fetch("DB.json", { cache: "no-store" });

    if (!response.ok) {
      throw new Error("DB.json not found in this folder.");
    }

    const obj = await response.json();
    if (!obj || typeof obj !== "object") {
      throw new Error("Invalid JSON structure.");
    }

    editingExpenseId = null;

    state.version = obj.version ?? 2;
    state.event = obj.event ?? { name: "", startDate: "", endDate: "" };
    state.people = Array.isArray(obj.people) ? obj.people : [];
    state.expenses = Array.isArray(obj.expenses) ? obj.expenses : [];

    // normalize people
    state.people = state.people.map(p => ({
      id: p.id || uid("p"),
      name: String(p.name || "").trim() || "Unnamed"
    }));

    // normalize expenses
    state.expenses = state.expenses.map(ex => ({
      id: ex.id || uid("e"),
      desc: String(ex.desc || ""),
      amount: Number(ex.amount || 0),
      payerId: String(ex.payerId || ""),
      date: String(ex.date || ""),
      participants: Array.isArray(ex.participants)
        ? ex.participants.map(String)
        : []
    })).filter(ex => ex.payerId);

    render();

  } catch (err) {
    alert("Could not load DB.json: " + err.message);
  }
}

/* ---------- PDF Export (better design) ---------- */

function exportPdf() {
  const { balances, settlements } = calculateAll();
  const total = totalTripExpenses();

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const margin = 44;
  const pageW = 595;
  const pageH = 842;
  let y = 54;

  // Title block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Splitko", margin, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  const title = state.event.name || "Event";
  const dates = [state.event.startDate, state.event.endDate].filter(Boolean).join(" → ");
  y += 22;
  doc.text(title, margin, y);

  y += 16;
  if (dates) doc.text(dates, margin, y);

  // Total pill style
  y += 18;
  doc.setFont("helvetica", "bold");
  doc.text(`Total expenses: ${formatEurPlain(total)}`, margin, y);

  y += 14;
  line(doc, margin, y, pageW - margin, y);
  y += 18;

  // Balances
  y = sectionTitle(doc, "Balances", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  for (const p of state.people) {
    if (y > pageH - 70) { doc.addPage(); y = 54; }
    const b = balances[p.id] ?? 0;
    doc.text(p.name, margin, y);
    doc.text(formatEurPlain(b), pageW - margin, y, { align: "right" });
    y += 16;
  }

  y += 8;
  line(doc, margin, y, pageW - margin, y);
  y += 18;

  // Settlements
  y = sectionTitle(doc, "Settle up (suggested payments)", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  if (settlements.length === 0) {
    doc.text("Nothing to settle.", margin, y);
    y += 16;
  } else {
    for (const s of settlements) {
      if (y > pageH - 70) { doc.addPage(); y = 54; }
      const text = `${getPersonName(s.from)} pays ${getPersonName(s.to)}`;
      doc.text(text, margin, y);
      doc.text(formatEurPlain(s.amount), pageW - margin, y, { align: "right" });
      y += 16;
    }
  }

  y += 8;
  line(doc, margin, y, pageW - margin, y);
  y += 18;

  // Expenses
  y = sectionTitle(doc, "Expenses", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  const sorted = [...state.expenses].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  if (sorted.length === 0) {
    doc.text("No expenses.", margin, y);
    y += 14;
  } else {
    for (const ex of sorted) {
      if (y > pageH - 90) { doc.addPage(); y = 54; }

      const head = `${ex.date || ""}  •  ${ex.desc || "Expense"}`;
      const paid = `Paid by: ${getPersonName(ex.payerId)}  •  Amount: ${formatEurPlain(ex.amount)}`;
      const involved = `Involved: ${ex.participants.map(getPersonName).join(", ")}`;

      doc.setFont("helvetica", "bold");
      doc.text(truncate(head, 95), margin, y);
      y += 13;

      doc.setFont("helvetica", "normal");
      doc.text(truncate(paid, 110), margin, y);
      y += 13;

      doc.text(truncate(involved, 110), margin, y);
      y += 16;

      // subtle divider
      doc.setDrawColor(220);
      doc.line(margin, y, pageW - margin, y);
      y += 12;
    }
  }

  doc.save(fileNameSafe(`${state.event.name || "event"}_splitko.pdf`));
}

function sectionTitle(doc, text, x, y) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(text, x, y);
  return y + 16;
}

function line(doc, x1, y1, x2, y2) {
  doc.setDrawColor(200);
  doc.line(x1, y1, x2, y2);
}

/* ---------- Helpers ---------- */

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[s]));
}

function downloadBlob(content, mime, filename) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function fileNameSafe(name) {
  return String(name)
    .trim()
    .replace(/[^\w\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function formatEurPlain(n) {
  const v = clampMoney(Number(n || 0));
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v).toFixed(2);
  return `${sign}€${abs}`;
}

function truncate(s, maxChars) {
  const str = String(s);
  return str.length <= maxChars ? str : str.slice(0, maxChars - 1) + "…";
}

/* ---------- Wire up events ---------- */

function syncEventToState() {
  state.event.name = els.eventName.value.trim();
  state.event.startDate = els.startDate.value;
  state.event.endDate = els.endDate.value;
}

els.eventName.addEventListener("input", () => { syncEventToState(); render(); });
els.startDate.addEventListener("change", () => { syncEventToState(); render(); });
els.endDate.addEventListener("change", () => { syncEventToState(); render(); });

els.addPersonForm.addEventListener("submit", (e) => {
  e.preventDefault();
  addPerson(els.personNameInput.value);
  els.personNameInput.value = "";
});

els.selectAllBtn.addEventListener("click", () => {
  $$("#participantsList input[type='checkbox']").forEach(c => c.checked = true);
});

els.selectNoneBtn.addEventListener("click", () => {
  $$("#participantsList input[type='checkbox']").forEach(c => c.checked = false);
});

els.cancelEditBtn.addEventListener("click", () => {
  stopEditExpense();
  render();
});

els.expenseForm.addEventListener("submit", (e) => {
  e.preventDefault();

  if (state.people.length === 0) {
    alert("Add at least one person first.");
    return;
  }

  const desc = els.expenseDesc.value.trim();
  const amount = clampMoney(Number(els.expenseAmount.value));
  const payerId = els.expensePayer.value;
  const date = els.expenseDate.value;
  const participants = readParticipantsFromUI();

  if (!payerId) { alert("Select who paid."); return; }
  if (!(amount > 0)) { alert("Enter an amount > 0."); return; }
  if (participants.length === 0) { alert("Pick at least one involved person."); return; }

  const payerExists = state.people.some(p => p.id === payerId);
  if (!payerExists) { alert("Payer is not in the people list."); return; }

  if (editingExpenseId) {
    // update existing
    const idx = state.expenses.findIndex(ex => ex.id === editingExpenseId);
    if (idx === -1) {
      // edge case: edited item disappeared
      editingExpenseId = null;
      alert("That expense no longer exists. Adding as new.");
      state.expenses.push({ id: uid("e"), desc, amount, payerId, date, participants });
    } else {
      state.expenses[idx] = { ...state.expenses[idx], desc, amount, payerId, date, participants };
    }
    stopEditExpense();
  } else {
    // add new
    state.expenses.push({ id: uid("e"), desc, amount, payerId, date, participants });
    clearExpenseForm();
  }

  render();
});

els.jsonFileInput.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) importJsonFile(file);
  els.jsonFileInput.value = "";
});

els.exportJsonBtn.addEventListener("click", exportJson);
els.exportPdfBtn.addEventListener("click", exportPdf);

const loadDbBtn = document.getElementById("loadDbBtn");
if (loadDbBtn) {
  loadDbBtn.addEventListener("click", loadDbFromFile);
}

// init
render();
