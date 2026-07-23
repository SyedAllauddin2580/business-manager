/*
  app.js
  Wires db.js (storage), logic.js (calculations), and charts.js
  (visuals) into the UI. Handles tab navigation, list rendering, and
  the add/edit bottom-sheet forms.
*/

let db;
let state = {
  activeTab: "dashboard",
  dashRange: "30",
  reportRange: "30",
  catalogSearch: "",
  catalogCategoryId: null,
  txnType: "all",
  txnFrom: "",
  txnTo: "",
  creditFilter: "due",
  loanFilter: "all",
};

// ------------------------------------------------------------------
// Bootstrapping
// ------------------------------------------------------------------
window.addEventListener("DOMContentLoaded", async () => {
  db = await Database.create();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }

  document.getElementById("top-date").textContent = formatDate(new Date());

  wireTabBar();
  wireDashboard();
  wireCatalog();
  wirePricing();
  wireCredit();
  wireLoans();
  wireTransactions();
  wireExpenses();
  wireReports();
  wireCapital();
  wireFab();
  wireSheet();

  await renderAll();
});

async function renderAll() {
  await renderDashboard();
  await renderCatalog();
  await renderPricing();
  await renderCredit();
  await renderLoans();
  await renderTransactions();
  await renderExpenses();
  await renderReports();
  await renderCapital();
}

// ------------------------------------------------------------------
// Small utilities
// ------------------------------------------------------------------
function money(v) {
  return (v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatDate(d) {
  return d.toISOString().slice(0, 10);
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1800);
}
function el(tag, className, html) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

// ------------------------------------------------------------------
// Tab navigation
// ------------------------------------------------------------------
function wireTabBar() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `panel-${tab}`));
  updateFabVisibility();
  // Canvases can't size themselves correctly while their tab is display:none,
  // so re-render charts right after the dashboard tab becomes visible.
  if (tab === "dashboard") renderDashboard();
  if (tab === "capital") renderCapital();
}

function updateFabVisibility() {
  const fab = document.getElementById("fab-btn");
  const hideOn = ["reports", "dashboard", "capital"];
  fab.style.display = hideOn.includes(state.activeTab) ? "none" : "flex";
}

function wireFab() {
  document.getElementById("fab-btn").addEventListener("click", () => {
    if (state.activeTab === "catalog") openProductSheet(null);
    else if (state.activeTab === "pricing") showToast("Tap a product to update its price");
    else if (state.activeTab === "credit") openRecordPaymentSheet();
    else if (state.activeTab === "transactions") openTransactionSheet();
    else if (state.activeTab === "expenses") openExpenseSheet();
  });
  updateFabVisibility();
}

// ------------------------------------------------------------------
// Bottom sheet (shared modal)
// ------------------------------------------------------------------
function wireSheet() {
  document.getElementById("sheet-close").addEventListener("click", closeSheet);
  document.getElementById("sheet-overlay").addEventListener("click", (e) => {
    if (e.target.id === "sheet-overlay") closeSheet();
  });
}
function openSheet(title, bodyEl) {
  document.getElementById("sheet-title").textContent = title;
  const body = document.getElementById("sheet-body");
  body.innerHTML = "";
  body.appendChild(bodyEl);
  document.getElementById("sheet-overlay").classList.add("open");
}
function closeSheet() {
  document.getElementById("sheet-overlay").classList.remove("open");
}

// ==================================================================
// DASHBOARD
// ==================================================================
function wireDashboard() {
  document.querySelectorAll("#dash-range-chips .chip").forEach((chip) => {
    chip.addEventListener("click", async () => {
      document.querySelectorAll("#dash-range-chips .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      state.dashRange = chip.dataset.range;
      await renderDashboard();
    });
  });
}

function resolveRange(rangeValue) {
  const today = new Date();
  let start;
  if (rangeValue === "month") {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
  } else {
    start = new Date(today);
    start.setDate(start.getDate() - parseInt(rangeValue, 10));
  }
  return { start: formatDate(start), end: formatDate(today) };
}

async function renderDashboard() {
  const { start, end } = resolveRange(state.dashRange);
  const today = todayStr();

  const transactions = await db.getTransactions({ start_date: start, end_date: end });
  const products = await db.getProducts();
  const costLookup = Object.fromEntries(products.map((p) => [p.id, p.purchase_price]));

  const result = computeCogsAndProfit(transactions, costLookup);
  const overheadMonthly = await db.totalMonthlyExpenses();
  const overheadPeriod = proratedOverhead(overheadMonthly, start, end);
  const netProfit = result.gross_profit - overheadPeriod;

  const todayTurnover = transactions
    .filter((t) => t.ttype === "sale" && t.tdate === today)
    .reduce((sum, t) => sum + t.total, 0);

  const saleTxns = transactions.filter((t) => t.ttype === "sale");
  const avgTxn = saleTxns.length ? saleTxns.reduce((s, t) => s + t.total, 0) / saleTxns.length : 0;

  const lowStock = await db.getLowStockProducts();
  const inv = await db.inventoryValue();
  const productCount = await db.countProducts();
  const totalDues = await db.getTotalOutstandingDues();

  const kpis = [
    ["Today's Turnover", money(todayTurnover)],
    ["Period Turnover", money(result.turnover)],
    ["Period Net Profit", money(netProfit)],
    ["Avg. Sale Value", money(avgTxn)],
    ["Total Products", String(productCount)],
    ["Low Stock Alerts", String(lowStock.length)],
    ["Inventory (cost)", money(inv.cost_value)],
    ["Inventory (retail)", money(inv.retail_value)],
    ["Outstanding Dues", money(totalDues)],
  ];
  const kpiGrid = document.getElementById("dash-kpis");
  kpiGrid.innerHTML = "";
  kpis.forEach(([label, value]) => {
    const card = el("div", "kpi-card");
    card.appendChild(el("div", "kpi-label", label));
    card.appendChild(el("div", "kpi-value", value));
    kpiGrid.appendChild(card);
  });

  const daily = await db.getDailyTurnover({ start_date: start, end_date: end });
  drawLineChart(
    document.getElementById("chart-trend"),
    daily.map((d) => d.tdate),
    daily.map((d) => d.revenue),
    { valueFmt: (v) => v.toFixed(0) }
  );

  const catSales = await db.getCategorySales({ start_date: start, end_date: end });
  drawPieChart(
    document.getElementById("chart-category"),
    catSales.map((c) => c.category_name),
    catSales.map((c) => c.revenue)
  );

  const topProducts = await db.getTopProducts({ start_date: start, end_date: end, limit: 5 });
  drawBarChart(
    document.getElementById("chart-top-products"),
    topProducts.map((p) => p.name),
    topProducts.map((p) => p.revenue),
    { valueFmt: (v) => v.toFixed(0) }
  );

  const lowStockList = document.getElementById("low-stock-list");
  lowStockList.innerHTML = "";
  if (!lowStock.length) {
    lowStockList.appendChild(el("div", "empty-state", "Nothing low on stock right now."));
  } else {
    lowStock.forEach((p) => {
      const row = el("div", "list-row");
      const main = el("div", "main");
      main.appendChild(el("div", "title", p.name));
      main.appendChild(el("div", "meta", `Reorder level: ${p.reorder_level}`));
      row.appendChild(main);
      row.appendChild(el("div", "value", `${p.stock_qty} left`));
      lowStockList.appendChild(row);
    });
  }
}

// ==================================================================
// CATALOG
// ==================================================================
function wireCatalog() {
  document.getElementById("catalog-search").addEventListener("input", async (e) => {
    state.catalogSearch = e.target.value;
    await renderCatalog();
  });
}

async function renderCatalogCategoryChips() {
  const categories = await db.getCategories();
  const wrap = document.getElementById("catalog-category-chips");
  wrap.innerHTML = "";
  const allChip = el("div", "chip" + (state.catalogCategoryId === null ? " active" : ""), "All");
  allChip.addEventListener("click", async () => {
    state.catalogCategoryId = null;
    await renderCatalog();
  });
  wrap.appendChild(allChip);
  categories.forEach((c) => {
    const chip = el("div", "chip" + (state.catalogCategoryId === c.id ? " active" : ""), c.name);
    chip.addEventListener("click", async () => {
      state.catalogCategoryId = c.id;
      await renderCatalog();
    });
    wrap.appendChild(chip);
  });
  const addChip = el("div", "chip", "+ New category");
  addChip.style.borderStyle = "dashed";
  addChip.addEventListener("click", openCategorySheet);
  wrap.appendChild(addChip);
}

async function renderCatalog() {
  await renderCatalogCategoryChips();
  const products = await db.getProducts({
    search: state.catalogSearch || null,
    category_id: state.catalogCategoryId,
  });
  const list = document.getElementById("catalog-list");
  list.innerHTML = "";
  if (!products.length) {
    list.appendChild(el("div", "empty-state", "No products yet. Tap + to add your first one."));
    return;
  }
  products.forEach((p) => {
    const row = el("div", "list-row");
    const main = el("div", "main");
    main.appendChild(el("div", "title", p.name));
    main.appendChild(
      el("div", "meta", `${p.category_name || "Uncategorized"} · Stock: ${p.stock_qty} ${p.unit}`)
    );
    row.appendChild(main);
    const valWrap = el("div");
    valWrap.style.textAlign = "right";
    valWrap.appendChild(el("div", "value", money(p.selling_price)));
    valWrap.appendChild(el("div", "value small", `cost ${money(p.purchase_price)}`));
    row.appendChild(valWrap);
    row.addEventListener("click", () => openProductSheet(p));
    list.appendChild(row);
  });
}

async function populateCategorySelect(selectEl, selectedId) {
  const categories = await db.getCategories();
  selectEl.innerHTML = '<option value="">— None —</option>';
  categories.forEach((c) => {
    const opt = el("option", null, c.name);
    opt.value = c.id;
    if (selectedId === c.id) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

function openCategorySheet() {
  const body = el("div");
  const field = el("div", "field");
  field.appendChild(el("label", null, "Category name"));
  const input = el("input");
  input.type = "text";
  field.appendChild(input);
  body.appendChild(field);
  const btn = el("button", "btn btn-primary btn-block", "Add Category");
  btn.addEventListener("click", async () => {
    const name = input.value.trim();
    if (!name) return;
    const ok = await db.addCategory(name);
    if (!ok) {
      showToast("That category already exists");
      return;
    }
    closeSheet();
    showToast("Category added");
    await renderCatalog();
  });
  body.appendChild(btn);
  openSheet("New Category", body);
}

function openProductSheet(product) {
  const isEdit = !!product;
  const body = el("div");

  const nameField = el("div", "field");
  nameField.appendChild(el("label", null, "Product name"));
  const nameInput = el("input");
  nameInput.type = "text";
  nameInput.value = isEdit ? product.name : "";
  nameField.appendChild(nameInput);
  body.appendChild(nameField);

  const row1 = el("div", "field-row");
  const skuField = el("div", "field");
  skuField.appendChild(el("label", null, "SKU"));
  const skuInput = el("input");
  skuInput.type = "text";
  skuInput.value = isEdit ? product.sku || "" : "";
  skuField.appendChild(skuInput);
  row1.appendChild(skuField);

  const unitField = el("div", "field");
  unitField.appendChild(el("label", null, "Unit"));
  const unitInput = el("input");
  unitInput.type = "text";
  unitInput.value = isEdit ? product.unit : "pcs";
  unitField.appendChild(unitInput);
  row1.appendChild(unitField);
  body.appendChild(row1);

  const catField = el("div", "field");
  catField.appendChild(el("label", null, "Category"));
  const catSelect = el("select");
  catField.appendChild(catSelect);
  body.appendChild(catField);
  populateCategorySelect(catSelect, isEdit ? product.category_id : null);

  const row2 = el("div", "field-row");
  const purchaseField = el("div", "field");
  purchaseField.appendChild(el("label", null, "Purchase Price"));
  const purchaseInput = el("input");
  purchaseInput.type = "number";
  purchaseInput.step = "0.01";
  purchaseInput.value = isEdit ? product.purchase_price : "";
  purchaseField.appendChild(purchaseInput);
  row2.appendChild(purchaseField);

  const sellingField = el("div", "field");
  sellingField.appendChild(el("label", null, "Selling Price"));
  const sellingInput = el("input");
  sellingInput.type = "number";
  sellingInput.step = "0.01";
  sellingInput.value = isEdit ? product.selling_price : "";
  sellingField.appendChild(sellingInput);
  row2.appendChild(sellingField);
  body.appendChild(row2);

  const row3 = el("div", "field-row");
  const stockField = el("div", "field");
  stockField.appendChild(el("label", null, "Stock Qty"));
  const stockInput = el("input");
  stockInput.type = "number";
  stockInput.value = isEdit ? product.stock_qty : "0";
  stockField.appendChild(stockInput);
  row3.appendChild(stockField);

  const reorderField = el("div", "field");
  reorderField.appendChild(el("label", null, "Reorder Level"));
  const reorderInput = el("input");
  reorderInput.type = "number";
  reorderInput.value = isEdit ? product.reorder_level : "0";
  reorderField.appendChild(reorderInput);
  row3.appendChild(reorderField);
  body.appendChild(row3);

  const unitsField = el("div", "field");
  unitsField.appendChild(el("label", null, "Est. Monthly Sales (units)"));
  const unitsInput = el("input");
  unitsInput.type = "number";
  unitsInput.value = isEdit ? product.est_monthly_units : "0";
  unitsField.appendChild(unitsInput);
  body.appendChild(unitsField);

  const btnRow = el("div", "btn-row");
  const saveBtn = el("button", "btn btn-primary", isEdit ? "Save Changes" : "Add Product");
  btnRow.appendChild(saveBtn);
  if (isEdit) {
    const delBtn = el("button", "btn btn-danger", "Delete");
    delBtn.addEventListener("click", async () => {
      if (confirm("Delete this product and its history? This cannot be undone.")) {
        await db.deleteProduct(product.id);
        closeSheet();
        showToast("Product deleted");
        await renderCatalog();
        await renderPricing();
      }
    });
    btnRow.appendChild(delBtn);
  }
  body.appendChild(btnRow);

  saveBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    if (!name) { showToast("Product name is required"); return; }
    const fields = {
      name,
      sku: skuInput.value.trim() || null,
      unit: unitInput.value.trim() || "pcs",
      category_id: catSelect.value ? parseInt(catSelect.value, 10) : null,
      purchase_price: parseFloat(purchaseInput.value) || 0,
      selling_price: parseFloat(sellingInput.value) || 0,
      stock_qty: parseFloat(stockInput.value) || 0,
      reorder_level: parseFloat(reorderInput.value) || 0,
      est_monthly_units: parseFloat(unitsInput.value) || 0,
    };
    if (isEdit) {
      await db.updateProduct(product.id, fields);
      await db.updatePrices(product.id, fields.purchase_price, fields.selling_price, "Edited via catalog");
    } else {
      await db.addProduct(fields);
    }
    closeSheet();
    showToast(isEdit ? "Product updated" : "Product added");
    await renderCatalog();
    await renderPricing();
    await renderExpenses();
  });

  openSheet(isEdit ? "Edit Product" : "New Product", body);
}

// ==================================================================
// PRICING
// ==================================================================
function wirePricing() {}

async function renderPricing() {
  const products = await db.getProducts();
  const list = document.getElementById("pricing-list");
  list.innerHTML = "";
  if (!products.length) {
    list.appendChild(el("div", "empty-state", "Add products in the Catalog tab first."));
    return;
  }
  products.forEach((p) => {
    const marginAbs = p.selling_price - p.purchase_price;
    const marginPct = p.selling_price ? (marginAbs / p.selling_price) * 100 : 0;
    const row = el("div", "list-row");
    const main = el("div", "main");
    main.appendChild(el("div", "title", p.name));
    main.appendChild(el("div", "meta", `Purchase ${money(p.purchase_price)} → Selling ${money(p.selling_price)}`));
    row.appendChild(main);
    const valWrap = el("div");
    valWrap.style.textAlign = "right";
    valWrap.appendChild(el("div", "value", `${marginPct.toFixed(1)}%`));
    valWrap.appendChild(el("div", "value small", `+${money(marginAbs)}`));
    row.appendChild(valWrap);
    row.addEventListener("click", () => openPriceSheet(p));
    list.appendChild(row);
  });
}

async function openPriceSheet(product) {
  const body = el("div");

  const row = el("div", "field-row");
  const purchaseField = el("div", "field");
  purchaseField.appendChild(el("label", null, "New Purchase Price"));
  const purchaseInput = el("input");
  purchaseInput.type = "number";
  purchaseInput.step = "0.01";
  purchaseInput.value = product.purchase_price;
  purchaseField.appendChild(purchaseInput);
  row.appendChild(purchaseField);

  const sellingField = el("div", "field");
  sellingField.appendChild(el("label", null, "New Selling Price"));
  const sellingInput = el("input");
  sellingInput.type = "number";
  sellingInput.step = "0.01";
  sellingInput.value = product.selling_price;
  sellingField.appendChild(sellingInput);
  row.appendChild(sellingField);
  body.appendChild(row);

  const noteField = el("div", "field");
  noteField.appendChild(el("label", null, "Note (optional)"));
  const noteInput = el("input");
  noteInput.type = "text";
  noteField.appendChild(noteInput);
  body.appendChild(noteField);

  const saveBtn = el("button", "btn btn-primary btn-block", "Apply Price Update");
  saveBtn.addEventListener("click", async () => {
    const purchase = parseFloat(purchaseInput.value);
    const selling = parseFloat(sellingInput.value);
    if (isNaN(purchase) || isNaN(selling)) { showToast("Prices must be numeric"); return; }
    await db.updatePrices(product.id, purchase, selling, noteInput.value.trim() || "Price update");
    closeSheet();
    showToast("Price updated");
    await renderPricing();
    await renderCatalog();
  });
  body.appendChild(saveBtn);

  body.appendChild(el("div", "section-title", "Price History"));
  const history = await db.getPriceHistory(product.id);
  const historyWrap = el("div");
  if (!history.length) {
    historyWrap.appendChild(el("div", "empty-state", "No history yet."));
  } else {
    history.forEach((h) => {
      const item = el(
        "div",
        "history-item",
        `${h.changed_at.replace("T", " ")} — P: ${money(h.purchase_price)} S: ${money(h.selling_price)}` +
          (h.note ? ` <span class="note">(${h.note})</span>` : "")
      );
      historyWrap.appendChild(item);
    });
  }
  body.appendChild(historyWrap);

  openSheet(product.name, body);
}

// ==================================================================
// CREDIT / DUES
// ==================================================================
function wireCredit() {
  document.querySelectorAll("#credit-filter-chips .chip[data-filter]").forEach((chip) => {
    chip.addEventListener("click", async () => {
      document.querySelectorAll("#credit-filter-chips .chip[data-filter]").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      state.creditFilter = chip.dataset.filter;
      await renderCredit();
    });
  });
  document.getElementById("credit-new-customer-chip").addEventListener("click", () => openCustomerSheet(null));
}

async function renderCredit() {
  const customers = await db.getCustomersWithBalances();
  const totalDues = customers.reduce((sum, c) => sum + Math.max(c.balance, 0), 0);
  const overdueCount = customers.filter((c) => c.balance > 0 && daysSince(c.last_activity) >= 7).length;

  const kpiGrid = document.getElementById("credit-kpis");
  kpiGrid.innerHTML = "";
  [
    ["Total Outstanding Dues", money(totalDues)],
    ["Customers Overdue (7+ days)", String(overdueCount)],
  ].forEach(([label, value]) => {
    const card = el("div", "kpi-card");
    card.appendChild(el("div", "kpi-label", label));
    card.appendChild(el("div", "kpi-value", value));
    kpiGrid.appendChild(card);
  });

  let filtered = customers;
  if (state.creditFilter === "due") filtered = customers.filter((c) => c.balance > 0);
  else if (state.creditFilter === "overdue") filtered = customers.filter((c) => c.balance > 0 && daysSince(c.last_activity) >= 7);

  filtered = filtered.slice().sort((a, b) => b.balance - a.balance);

  const list = document.getElementById("credit-list");
  list.innerHTML = "";
  if (!filtered.length) {
    const msg = state.creditFilter === "all" ? "No customers added yet." : "Nobody owes anything right now 🎉";
    list.appendChild(el("div", "empty-state", msg));
    return;
  }

  filtered.forEach((c) => {
    const days = daysSince(c.last_activity);
    const isOverdue = c.balance > 0 && days !== null && days >= 7;
    const row = el("div", "list-row");
    const main = el("div", "main");
    const titleWrap = el("div", "title");
    titleWrap.textContent = c.name + " ";
    if (isOverdue) {
      const badge = el("span", "badge overdue", `${days}d overdue`);
      titleWrap.appendChild(badge);
    } else if (c.balance <= 0 && c.entry_count > 0) {
      const badge = el("span", "badge credit-ok", "clear");
      titleWrap.appendChild(badge);
    }
    main.appendChild(titleWrap);
    main.appendChild(el("div", "meta", c.phone ? c.phone : "No phone on file"));
    row.appendChild(main);
    const valClass = c.balance > 0 ? "value danger" : "value success";
    row.appendChild(el("div", valClass, money(Math.abs(c.balance)) + (c.balance < 0 ? " cr." : "")));
    row.addEventListener("click", () => openCustomerLedgerSheet(c));
    list.appendChild(row);
  });
}

function openCustomerSheet(customer) {
  const isEdit = !!customer;
  const body = el("div");

  const nameField = el("div", "field");
  nameField.appendChild(el("label", null, "Customer Name"));
  const nameInput = el("input");
  nameInput.type = "text";
  nameInput.value = isEdit ? customer.name : "";
  nameField.appendChild(nameInput);
  body.appendChild(nameField);

  const phoneField = el("div", "field");
  phoneField.appendChild(el("label", null, "Phone (optional)"));
  const phoneInput = el("input");
  phoneInput.type = "text";
  phoneInput.value = isEdit ? customer.phone || "" : "";
  phoneField.appendChild(phoneInput);
  body.appendChild(phoneField);

  const notesField = el("div", "field");
  notesField.appendChild(el("label", null, "Notes (optional)"));
  const notesInput = el("input");
  notesInput.type = "text";
  notesInput.value = isEdit ? customer.notes || "" : "";
  notesField.appendChild(notesInput);
  body.appendChild(notesField);

  const btnRow = el("div", "btn-row");
  const saveBtn = el("button", "btn btn-primary", isEdit ? "Save Changes" : "Add Customer");
  btnRow.appendChild(saveBtn);
  if (isEdit) {
    const delBtn = el("button", "btn btn-danger", "Delete");
    delBtn.addEventListener("click", async () => {
      if (confirm(`Delete ${customer.name} and their entire credit history? This cannot be undone.`)) {
        await db.deleteCustomer(customer.id);
        closeSheet();
        showToast("Customer deleted");
        await renderCredit();
      }
    });
    btnRow.appendChild(delBtn);
  }
  body.appendChild(btnRow);

  saveBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    if (!name) { showToast("Customer name is required"); return; }
    if (isEdit) {
      await db.updateCustomer(customer.id, { name, phone: phoneInput.value.trim(), notes: notesInput.value.trim() });
    } else {
      await db.addCustomer(name, phoneInput.value.trim(), notesInput.value.trim());
    }
    closeSheet();
    showToast(isEdit ? "Customer updated" : "Customer added");
    await renderCredit();
  });

  openSheet(isEdit ? "Edit Customer" : "New Customer", body);
}

async function openCustomerLedgerSheet(customer) {
  const body = el("div");

  const balanceCard = el("div", "kpi-card");
  balanceCard.appendChild(el("div", "kpi-label", customer.phone || "Balance"));
  const balVal = el("div", "kpi-value", money(Math.abs(customer.balance)) + (customer.balance < 0 ? " credit" : customer.balance > 0 ? " due" : ""));
  if (customer.balance > 0) balVal.classList.add("danger");
  else if (customer.balance < 0) balVal.classList.add("success");
  balanceCard.appendChild(balVal);
  body.appendChild(balanceCard);

  const editBtn = el("button", "btn btn-secondary btn-block", "Edit Customer Details");
  editBtn.style.marginTop = "8px";
  editBtn.addEventListener("click", () => openCustomerSheet(customer));
  body.appendChild(editBtn);

  body.appendChild(el("div", "section-title", "Record a Payment"));
  const row = el("div", "field-row");
  const amtField = el("div", "field");
  amtField.appendChild(el("label", null, "Amount Received"));
  const amtInput = el("input");
  amtInput.type = "number";
  amtInput.step = "0.01";
  amtField.appendChild(amtInput);
  row.appendChild(amtField);
  const dateField = el("div", "field");
  dateField.appendChild(el("label", null, "Date"));
  const dateInput = el("input");
  dateInput.type = "date";
  dateInput.value = todayStr();
  dateField.appendChild(dateInput);
  row.appendChild(dateField);
  body.appendChild(row);

  const notesField = el("div", "field");
  notesField.appendChild(el("label", null, "Notes (optional)"));
  const notesInput = el("input");
  notesInput.type = "text";
  notesField.appendChild(notesInput);
  body.appendChild(notesField);

  const payBtn = el("button", "btn btn-primary btn-block", "Record Payment");
  payBtn.addEventListener("click", async () => {
    const amount = parseFloat(amtInput.value);
    if (isNaN(amount) || amount <= 0) { showToast("Enter a valid payment amount"); return; }
    await db.addCreditPayment(customer.id, amount, dateInput.value || todayStr(), notesInput.value.trim());
    closeSheet();
    showToast("Payment recorded");
    await renderCredit();
    await renderDashboard();
  });
  body.appendChild(payBtn);

  body.appendChild(el("div", "section-title", "Ledger History"));
  const ledger = await db.getCreditLedger(customer.id);
  const ledgerWrap = el("div");
  if (!ledger.length) {
    ledgerWrap.appendChild(el("div", "empty-state", "No credit activity yet."));
  } else {
    ledger.forEach((entry) => {
      const sign = entry.entry_type === "charge" ? "+" : "−";
      const item = el(
        "div",
        "history-item",
        `${entry.date} — ${sign}${money(entry.amount)} <span class="note">(${entry.entry_type}${entry.notes ? ": " + entry.notes : ""})</span>`
      );
      ledgerWrap.appendChild(item);
    });
  }
  body.appendChild(ledgerWrap);

  openSheet(customer.name, body);
}

async function openRecordPaymentSheet() {
  const customers = await db.getCustomersWithBalances();
  const withDues = customers.filter((c) => c.balance > 0);
  if (!withDues.length) {
    showToast("No outstanding dues right now");
    return;
  }
  const body = el("div");

  const custField = el("div", "field");
  custField.appendChild(el("label", null, "Customer"));
  const custSelect = el("select");
  withDues.forEach((c) => {
    const opt = el("option", null, `${c.name} — owes ${money(c.balance)}`);
    opt.value = c.id;
    custSelect.appendChild(opt);
  });
  custField.appendChild(custSelect);
  body.appendChild(custField);

  const row = el("div", "field-row");
  const amtField = el("div", "field");
  amtField.appendChild(el("label", null, "Amount Received"));
  const amtInput = el("input");
  amtInput.type = "number";
  amtInput.step = "0.01";
  amtField.appendChild(amtInput);
  row.appendChild(amtField);
  const dateField = el("div", "field");
  dateField.appendChild(el("label", null, "Date"));
  const dateInput = el("input");
  dateInput.type = "date";
  dateInput.value = todayStr();
  dateField.appendChild(dateInput);
  row.appendChild(dateField);
  body.appendChild(row);

  const notesField = el("div", "field");
  notesField.appendChild(el("label", null, "Notes (optional)"));
  const notesInput = el("input");
  notesInput.type = "text";
  notesField.appendChild(notesInput);
  body.appendChild(notesField);

  const payBtn = el("button", "btn btn-primary btn-block", "Record Payment");
  payBtn.addEventListener("click", async () => {
    const amount = parseFloat(amtInput.value);
    if (isNaN(amount) || amount <= 0) { showToast("Enter a valid payment amount"); return; }
    await db.addCreditPayment(parseInt(custSelect.value, 10), amount, dateInput.value || todayStr(), notesInput.value.trim());
    closeSheet();
    showToast("Payment recorded");
    await renderCredit();
    await renderDashboard();
  });
  body.appendChild(payBtn);

  openSheet("Record Payment", body);
}

// ==================================================================
// OTHER CREDIT (loans/borrowings, either direction)
// ==================================================================
function wireLoans() {
  document.querySelectorAll("#loan-filter-chips .chip[data-filter]").forEach((chip) => {
    chip.addEventListener("click", async () => {
      document.querySelectorAll("#loan-filter-chips .chip[data-filter]").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      state.loanFilter = chip.dataset.filter;
      await renderLoans();
    });
  });
  document.getElementById("loan-new-chip").addEventListener("click", () => openLoanSheet(null));
}

async function renderLoans() {
  const totals = await db.getOtherCreditTotals();
  const kpiGrid = document.getElementById("loan-kpis");
  kpiGrid.innerHTML = "";
  [
    ["You Owe (Taken)", money(totals.takenOutstanding)],
    ["Owed to You (Given)", money(totals.givenOutstanding)],
  ].forEach(([label, value]) => {
    const card = el("div", "kpi-card");
    card.appendChild(el("div", "kpi-label", label));
    card.appendChild(el("div", "kpi-value", value));
    kpiGrid.appendChild(card);
  });

  const records = await db.getOtherCreditsWithBalances();
  let filtered = records;
  if (state.loanFilter === "taken") filtered = records.filter((r) => r.direction === "taken");
  else if (state.loanFilter === "given") filtered = records.filter((r) => r.direction === "given");
  filtered = filtered.slice().sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

  const list = document.getElementById("loan-list");
  list.innerHTML = "";
  if (!filtered.length) {
    list.appendChild(el("div", "empty-state", "No entries yet. Tap + New Entry to add one."));
    return;
  }
  filtered.forEach((r) => {
    const row = el("div", "list-row");
    const main = el("div", "main");
    const titleWrap = el("div", "title");
    titleWrap.textContent = r.party_name + " ";
    const dirBadge = el("span", "badge " + (r.direction === "taken" ? "purchase" : "sale"),
                         r.direction === "taken" ? "you owe" : "owed to you");
    titleWrap.appendChild(dirBadge);
    if (r.balance <= 0 && r.entry_count > 0) titleWrap.appendChild(el("span", "badge credit-ok", "settled"));
    main.appendChild(titleWrap);
    main.appendChild(el("div", "meta", r.notes || (r.direction === "taken" ? "Money you borrowed" : "Money you lent")));
    row.appendChild(main);
    const valClass = r.balance > 0 ? "value danger" : "value success";
    row.appendChild(el("div", valClass, money(Math.abs(r.balance))));
    row.addEventListener("click", () => openLoanLedgerSheet(r));
    list.appendChild(row);
  });
}

function openLoanSheet(loan) {
  const isEdit = !!loan;
  const body = el("div");

  const nameField = el("div", "field");
  nameField.appendChild(el("label", null, "Party Name (person/business)"));
  const nameInput = el("input");
  nameInput.type = "text";
  nameInput.value = isEdit ? loan.party_name : "";
  nameField.appendChild(nameInput);
  body.appendChild(nameField);

  const dirField = el("div", "field");
  dirField.appendChild(el("label", null, "Direction"));
  const dirSelect = el("select");
  const opt1 = el("option", null, "I Took Credit (I owe them)"); opt1.value = "taken";
  const opt2 = el("option", null, "I Gave Credit (They owe me)"); opt2.value = "given";
  dirSelect.appendChild(opt1);
  dirSelect.appendChild(opt2);
  if (isEdit) dirSelect.value = loan.direction;
  dirField.appendChild(dirSelect);
  body.appendChild(dirField);
  if (isEdit) {
    dirSelect.disabled = true; // direction fixed after creation to keep the ledger meaningful
    dirField.appendChild(el("div", "meta", "Direction can't change once entries exist — delete and re-add if needed."));
  }

  let amountInput, dateInput;
  if (!isEdit) {
    const row = el("div", "field-row");
    const amtField = el("div", "field");
    amtField.appendChild(el("label", null, "Amount"));
    amountInput = el("input");
    amountInput.type = "number";
    amountInput.step = "0.01";
    amtField.appendChild(amountInput);
    row.appendChild(amtField);

    const dtField = el("div", "field");
    dtField.appendChild(el("label", null, "Date"));
    dateInput = el("input");
    dateInput.type = "date";
    dateInput.value = todayStr();
    dtField.appendChild(dateInput);
    row.appendChild(dtField);
    body.appendChild(row);
  }

  const notesField = el("div", "field");
  notesField.appendChild(el("label", null, "Notes (optional)"));
  const notesInput = el("input");
  notesInput.type = "text";
  notesInput.value = isEdit ? loan.notes || "" : "";
  notesField.appendChild(notesInput);
  body.appendChild(notesField);

  const btnRow = el("div", "btn-row");
  const saveBtn = el("button", "btn btn-primary", isEdit ? "Save Changes" : "Add Entry");
  btnRow.appendChild(saveBtn);
  if (isEdit) {
    const delBtn = el("button", "btn btn-danger", "Delete");
    delBtn.addEventListener("click", async () => {
      if (confirm(`Delete this entire record for ${loan.party_name}? This cannot be undone.`)) {
        await db.deleteOtherCredit(loan.id);
        closeSheet();
        showToast("Entry deleted");
        await renderLoans();
      }
    });
    btnRow.appendChild(delBtn);
  }
  body.appendChild(btnRow);

  saveBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    if (!name) { showToast("Enter the party's name"); return; }
    if (isEdit) {
      await db.updateOtherCredit(loan.id, { party_name: name, notes: notesInput.value.trim() });
    } else {
      const amount = parseFloat(amountInput.value);
      if (isNaN(amount) || amount <= 0) { showToast("Enter a valid amount"); return; }
      await db.addOtherCredit(name, dirSelect.value, amount, dateInput.value || todayStr(), notesInput.value.trim());
    }
    closeSheet();
    showToast(isEdit ? "Entry updated" : "Entry added");
    await renderLoans();
  });

  openSheet(isEdit ? "Edit Entry" : "New Credit Entry", body);
}

async function openLoanLedgerSheet(loan) {
  const body = el("div");
  const isTaken = loan.direction === "taken";

  const balanceCard = el("div", "kpi-card");
  balanceCard.appendChild(el("div", "kpi-label", isTaken ? "You owe them" : "They owe you"));
  const balVal = el("div", "kpi-value", money(Math.abs(loan.balance)));
  if (loan.balance > 0) balVal.classList.add("danger");
  else if (loan.balance <= 0) balVal.classList.add("success");
  balanceCard.appendChild(balVal);
  body.appendChild(balanceCard);

  const editBtn = el("button", "btn btn-secondary btn-block", "Edit Details");
  editBtn.style.marginTop = "8px";
  editBtn.addEventListener("click", () => openLoanSheet(loan));
  body.appendChild(editBtn);

  body.appendChild(el("div", "section-title", isTaken ? "Record a Repayment (to them)" : "Record a Repayment (from them)"));
  const row = el("div", "field-row");
  const amtField = el("div", "field");
  amtField.appendChild(el("label", null, "Amount"));
  const amtInput = el("input");
  amtInput.type = "number";
  amtInput.step = "0.01";
  amtField.appendChild(amtInput);
  row.appendChild(amtField);
  const dateField = el("div", "field");
  dateField.appendChild(el("label", null, "Date"));
  const dateInput = el("input");
  dateInput.type = "date";
  dateInput.value = todayStr();
  dateField.appendChild(dateInput);
  row.appendChild(dateField);
  body.appendChild(row);

  const notesField = el("div", "field");
  notesField.appendChild(el("label", null, "Notes (optional)"));
  const notesInput = el("input");
  notesInput.type = "text";
  notesField.appendChild(notesInput);
  body.appendChild(notesField);

  const payBtn = el("button", "btn btn-primary btn-block", "Record Repayment");
  payBtn.addEventListener("click", async () => {
    const amount = parseFloat(amtInput.value);
    if (isNaN(amount) || amount <= 0) { showToast("Enter a valid amount"); return; }
    await db.addOtherCreditPayment(loan.id, amount, dateInput.value || todayStr(), notesInput.value.trim());
    closeSheet();
    showToast("Repayment recorded");
    await renderLoans();
  });
  body.appendChild(payBtn);

  body.appendChild(el("div", "section-title", "Ledger History"));
  const ledger = await db.getOtherCreditLedger(loan.id);
  const ledgerWrap = el("div");
  if (!ledger.length) {
    ledgerWrap.appendChild(el("div", "empty-state", "No activity yet."));
  } else {
    ledger.forEach((entry) => {
      const sign = entry.entry_type === "charge" ? "+" : "−";
      const item = el(
        "div",
        "history-item",
        `${entry.date} — ${sign}${money(entry.amount)} <span class="note">(${entry.entry_type}${entry.notes ? ": " + entry.notes : ""})</span>`
      );
      ledgerWrap.appendChild(item);
    });
  }
  body.appendChild(ledgerWrap);

  openSheet(loan.party_name, body);
}

// ==================================================================
// TRANSACTIONS
// ==================================================================
function wireTransactions() {
  document.querySelectorAll("#txn-type-chips .chip").forEach((chip) => {
    chip.addEventListener("click", async () => {
      document.querySelectorAll("#txn-type-chips .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      state.txnType = chip.dataset.type;
      await renderTransactions();
    });
  });
  document.getElementById("txn-from").addEventListener("change", async (e) => {
    state.txnFrom = e.target.value;
    await renderTransactions();
  });
  document.getElementById("txn-to").addEventListener("change", async (e) => {
    state.txnTo = e.target.value;
    await renderTransactions();
  });
}

async function renderTransactions() {
  const ttype = state.txnType === "all" ? null : state.txnType;
  const transactions = await db.getTransactions({
    start_date: state.txnFrom || null,
    end_date: state.txnTo || null,
    ttype,
  });

  let turnover = 0, purchasesTotal = 0;
  transactions.forEach((t) => {
    if (t.ttype === "sale") turnover += t.total;
    else if (t.ttype === "purchase") purchasesTotal += t.total;
  });

  const summary = document.getElementById("txn-summary");
  summary.innerHTML = "";
  [["Sales Turnover", money(turnover)], ["Purchases (Restocking)", money(purchasesTotal)]].forEach(
    ([label, value]) => {
      const card = el("div", "kpi-card");
      card.appendChild(el("div", "kpi-label", label));
      card.appendChild(el("div", "kpi-value", value));
      summary.appendChild(card);
    }
  );

  const list = document.getElementById("txn-list");
  list.innerHTML = "";
  if (!transactions.length) {
    list.appendChild(el("div", "empty-state", "No transactions in this range yet."));
    return;
  }
  transactions.forEach((t) => {
    const row = el("div", "list-row");
    const main = el("div", "main");
    const titleWrap = el("div", "title");
    titleWrap.innerHTML = `${t.product_name} <span class="badge ${t.ttype}">${t.ttype}</span>`;
    main.appendChild(titleWrap);
    main.appendChild(el("div", "meta", `${t.tdate} · Qty ${t.quantity}${t.notes ? " · " + t.notes : ""}`));
    row.appendChild(main);
    row.appendChild(el("div", "value", money(t.total)));
    row.addEventListener("click", () => openEditTransactionSheet(t));
    list.appendChild(row);
  });
}

async function openEditTransactionSheet(t) {
  const products = await db.getProducts();
  const body = el("div");

  const prodField = el("div", "field");
  prodField.appendChild(el("label", null, "Product"));
  const prodSelect = el("select");
  products.forEach((p) => {
    const opt = el("option", null, p.name);
    opt.value = p.id;
    if (p.id === t.product_id) opt.selected = true;
    prodSelect.appendChild(opt);
  });
  prodField.appendChild(prodSelect);
  body.appendChild(prodField);

  const row1 = el("div", "field-row");
  const typeField = el("div", "field");
  typeField.appendChild(el("label", null, "Type"));
  const typeSelect = el("select");
  ["sale", "purchase", "adjustment"].forEach((tt) => {
    const opt = el("option", null, tt);
    opt.value = tt;
    if (tt === t.ttype) opt.selected = true;
    typeSelect.appendChild(opt);
  });
  typeField.appendChild(typeSelect);
  row1.appendChild(typeField);

  const qtyField = el("div", "field");
  qtyField.appendChild(el("label", null, "Quantity"));
  const qtyInput = el("input");
  qtyInput.type = "number";
  qtyInput.value = t.quantity;
  qtyField.appendChild(qtyInput);
  row1.appendChild(qtyField);
  body.appendChild(row1);

  const row2 = el("div", "field-row");
  const priceField = el("div", "field");
  priceField.appendChild(el("label", null, "Unit Price"));
  const priceInput = el("input");
  priceInput.type = "number";
  priceInput.step = "0.01";
  priceInput.value = t.unit_price;
  priceField.appendChild(priceInput);
  row2.appendChild(priceField);

  const dateField = el("div", "field");
  dateField.appendChild(el("label", null, "Date"));
  const dateInput = el("input");
  dateInput.type = "date";
  dateInput.value = t.tdate;
  dateField.appendChild(dateInput);
  row2.appendChild(dateField);
  body.appendChild(row2);

  const notesField = el("div", "field");
  notesField.appendChild(el("label", null, "Notes"));
  const notesInput = el("input");
  notesInput.type = "text";
  notesInput.value = t.notes || "";
  notesField.appendChild(notesInput);
  body.appendChild(notesField);

  const note = el("div", "note-box",
    "Editing automatically corrects stock for you (reverses the old quantity effect, applies the new one). " +
    "Note: if this was a credit sale, this won't update the customer's ledger in the Credit tab — adjust that separately if needed."
  );
  body.appendChild(note);

  const btnRow = el("div", "btn-row");
  const saveBtn = el("button", "btn btn-primary", "Save Changes");
  const delBtn = el("button", "btn btn-danger", "Delete");
  btnRow.appendChild(saveBtn);
  btnRow.appendChild(delBtn);
  body.appendChild(btnRow);

  delBtn.addEventListener("click", async () => {
    if (confirm(`Delete this ${t.ttype} entry? Stock will not be auto-reverted.`)) {
      await db.deleteTransaction(t.id);
      closeSheet();
      showToast("Transaction deleted");
      await renderTransactions();
      await renderCatalog();
      await renderDashboard();
    }
  });

  saveBtn.addEventListener("click", async () => {
    const qty = parseFloat(qtyInput.value);
    const price = parseFloat(priceInput.value);
    if (isNaN(qty) || isNaN(price)) { showToast("Quantity and price must be numeric"); return; }
    await db.updateTransaction(t.id, {
      product_id: parseInt(prodSelect.value, 10),
      ttype: typeSelect.value,
      quantity: qty,
      unit_price: price,
      tdate: dateInput.value || t.tdate,
      notes: notesInput.value.trim(),
    });
    closeSheet();
    showToast("Transaction updated");
    await renderTransactions();
    await renderCatalog();
    await renderDashboard();
  });

  openSheet("Edit Transaction", body);
}

async function openTransactionSheet() {
  const products = await db.getProducts();
  if (!products.length) {
    showToast("Add a product in the Catalog tab first");
    return;
  }
  const body = el("div");

  const prodField = el("div", "field");
  prodField.appendChild(el("label", null, "Product"));
  const prodSelect = el("select");
  products.forEach((p) => {
    const opt = el("option", null, p.name);
    opt.value = p.id;
    prodSelect.appendChild(opt);
  });
  prodField.appendChild(prodSelect);
  body.appendChild(prodField);

  const row1 = el("div", "field-row");
  const typeField = el("div", "field");
  typeField.appendChild(el("label", null, "Type"));
  const typeSelect = el("select");
  ["sale", "purchase", "adjustment"].forEach((t) => {
    const opt = el("option", null, t);
    opt.value = t;
    typeSelect.appendChild(opt);
  });
  typeField.appendChild(typeSelect);
  row1.appendChild(typeField);

  const qtyField = el("div", "field");
  qtyField.appendChild(el("label", null, "Quantity"));
  const qtyInput = el("input");
  qtyInput.type = "number";
  qtyField.appendChild(qtyInput);
  row1.appendChild(qtyField);
  body.appendChild(row1);

  const row2 = el("div", "field-row");
  const priceField = el("div", "field");
  priceField.appendChild(el("label", null, "Unit Price"));
  const priceInput = el("input");
  priceInput.type = "number";
  priceInput.step = "0.01";
  const setDefaultPrice = () => {
    const p = products.find((pp) => pp.id === parseInt(prodSelect.value, 10));
    if (!p) return;
    priceInput.value = typeSelect.value === "purchase" ? p.purchase_price : p.selling_price;
  };
  setDefaultPrice();
  prodSelect.addEventListener("change", setDefaultPrice);
  typeSelect.addEventListener("change", setDefaultPrice);
  priceField.appendChild(priceInput);
  row2.appendChild(priceField);

  const dateField = el("div", "field");
  dateField.appendChild(el("label", null, "Date"));
  const dateInput = el("input");
  dateInput.type = "date";
  dateInput.value = todayStr();
  dateField.appendChild(dateInput);
  row2.appendChild(dateField);
  body.appendChild(row2);

  const notesField = el("div", "field");
  notesField.appendChild(el("label", null, "Notes"));
  const notesInput = el("input");
  notesInput.type = "text";
  notesField.appendChild(notesInput);
  body.appendChild(notesField);

  // ---- On-credit option (only relevant for sales) ----
  const customers = await db.getCustomers();
  const creditToggleField = el("div", "field");
  const creditLabel = el("label");
  creditLabel.style.display = "flex";
  creditLabel.style.alignItems = "center";
  creditLabel.style.gap = "6px";
  creditLabel.style.textTransform = "none";
  const creditCheckbox = el("input");
  creditCheckbox.type = "checkbox";
  creditCheckbox.style.width = "auto";
  creditLabel.appendChild(creditCheckbox);
  creditLabel.appendChild(document.createTextNode("Sold on credit (customer will pay later)"));
  creditToggleField.appendChild(creditLabel);
  body.appendChild(creditToggleField);

  const creditDetails = el("div");
  creditDetails.style.display = "none";
  const custField = el("div", "field");
  custField.appendChild(el("label", null, "Customer Name"));
  const custInput = el("input");
  custInput.type = "text";
  custInput.placeholder = "Type to search existing or add new…";
  custInput.setAttribute("list", "customer-name-datalist");
  const custDatalist = el("datalist");
  custDatalist.id = "customer-name-datalist";
  customers.forEach((c) => {
    const opt = el("option");
    opt.value = c.name;
    custDatalist.appendChild(opt);
  });
  custField.appendChild(custInput);
  custField.appendChild(custDatalist);
  const custHint = el("div", "meta", "Existing customers show as you type. New name? It'll be added automatically — add their phone/notes later in the Credit tab.");
  custHint.style.marginTop = "4px";
  custField.appendChild(custHint);
  creditDetails.appendChild(custField);

  const paidNowField = el("div", "field");
  paidNowField.appendChild(el("label", null, "Amount Paid Now (0 if fully on credit)"));
  const paidNowInput = el("input");
  paidNowInput.type = "number";
  paidNowInput.step = "0.01";
  paidNowInput.value = "0";
  paidNowField.appendChild(paidNowInput);
  creditDetails.appendChild(paidNowField);
  body.appendChild(creditDetails);

  const toggleCreditVisibility = () => {
    const showCredit = typeSelect.value === "sale" && creditCheckbox.checked;
    creditDetails.style.display = showCredit ? "block" : "none";
  };
  creditCheckbox.addEventListener("change", toggleCreditVisibility);
  typeSelect.addEventListener("change", () => {
    if (typeSelect.value !== "sale") {
      creditCheckbox.checked = false;
      creditToggleField.style.display = "none";
    } else {
      creditToggleField.style.display = "block";
    }
    toggleCreditVisibility();
  });

  const saveBtn = el("button", "btn btn-primary btn-block", "Add Transaction");
  saveBtn.addEventListener("click", async () => {
    const qty = parseFloat(qtyInput.value);
    const price = parseFloat(priceInput.value);
    if (isNaN(qty) || isNaN(price)) { showToast("Quantity and price must be numeric"); return; }

    const isCredit = typeSelect.value === "sale" && creditCheckbox.checked;
    if (isCredit) {
      const custName = custInput.value.trim();
      if (!custName) { showToast("Enter the customer's name"); return; }
      const customerId = await db.findOrCreateCustomerByName(custName);
      const paidNow = parseFloat(paidNowInput.value) || 0;
      await db.addCreditSale({
        customer_id: customerId,
        product_id: parseInt(prodSelect.value, 10),
        quantity: qty,
        unit_price: price,
        amount_paid_now: paidNow,
        date: dateInput.value || todayStr(),
        notes: notesInput.value.trim(),
      });
    } else {
      await db.addTransaction(
        parseInt(prodSelect.value, 10),
        typeSelect.value,
        qty,
        price,
        dateInput.value || todayStr(),
        notesInput.value.trim()
      );
    }
    closeSheet();
    showToast(isCredit ? "Credit sale recorded" : "Transaction recorded");
    await renderTransactions();
    await renderCatalog();
    await renderDashboard();
    await renderCredit();
  });
  body.appendChild(saveBtn);

  openSheet("Record Transaction", body);
}

// ==================================================================
// EXPENSES & RECOMMENDER
// ==================================================================
function wireExpenses() {
  document.getElementById("rec-calculate").addEventListener("click", calculateRecommendation);
  document.getElementById("rec-product").addEventListener("change", async () => {
    const products = await db.getProducts();
    const p = products.find((pp) => pp.id === parseInt(document.getElementById("rec-product").value, 10));
    if (p) document.getElementById("rec-units").value = p.est_monthly_units || 0;
  });
}

async function renderExpenses() {
  const expenses = await db.getExpenses();
  const total = await db.totalMonthlyExpenses();

  const totalCard = document.getElementById("expenses-total");
  totalCard.innerHTML = "";
  totalCard.appendChild(el("div", "kpi-label", "Total Recurring Monthly Overhead"));
  totalCard.appendChild(el("div", "kpi-value", money(total)));

  const list = document.getElementById("expenses-list");
  list.innerHTML = "";
  if (!expenses.length) {
    list.appendChild(el("div", "empty-state", "No expenses added yet."));
  } else {
    expenses.forEach((exp) => {
      const row = el("div", "list-row");
      const main = el("div", "main");
      main.appendChild(el("div", "title", exp.name));
      main.appendChild(el("div", "meta", exp.frequency));
      row.appendChild(main);
      row.appendChild(el("div", "value", money(exp.amount)));
      row.addEventListener("click", async () => {
        if (confirm(`Delete expense "${exp.name}"?`)) {
          await db.deleteExpense(exp.id);
          showToast("Expense deleted");
          await renderExpenses();
        }
      });
      list.appendChild(row);
    });
  }

  const products = await db.getProducts();
  const recSelect = document.getElementById("rec-product");
  const prevValue = recSelect.value;
  recSelect.innerHTML = "";
  products.forEach((p) => {
    const opt = el("option", null, p.name);
    opt.value = p.id;
    recSelect.appendChild(opt);
  });
  if (prevValue) recSelect.value = prevValue;

  await renderRecommenderQuickView(products, total);
}

async function calculateRecommendation() {
  const products = await db.getProducts();
  const productId = parseInt(document.getElementById("rec-product").value, 10);
  const product = products.find((p) => p.id === productId);
  if (!product) { showToast("Add a product first"); return; }

  const estUnits = parseFloat(document.getElementById("rec-units").value) || 0;
  const targetMargin = parseFloat(document.getElementById("rec-margin").value) || 0;
  const overhead = await db.totalMonthlyExpenses();

  const result = recommendSellingPrice(product.purchase_price, overhead, estUnits, targetMargin);

  const breakdown = document.getElementById("rec-breakdown");
  breakdown.innerHTML = "";
  const rows = [
    ["Purchase price per unit", money(result.purchase_price)],
    ["Allocated overhead per unit", money(result.overhead_per_unit)],
    ["True break-even cost per unit", money(result.base_cost_per_unit)],
    ["Profit per unit at target margin", money(result.profit_per_unit)],
  ];
  rows.forEach(([label, value]) => {
    const row = el("div", "breakdown-row");
    row.appendChild(el("span", null, label));
    row.appendChild(el("span", "val", value));
    breakdown.appendChild(row);
  });
  const totalRow = el("div", "breakdown-row total");
  totalRow.appendChild(el("span", null, "Recommended Selling Price"));
  totalRow.appendChild(el("span", "val", money(result.recommended_price)));
  breakdown.appendChild(totalRow);

  await db.updateProduct(product.id, { est_monthly_units: estUnits });
}

async function renderRecommenderQuickView(products, overhead) {
  const targetMargin = parseFloat(document.getElementById("rec-margin").value) || 30;
  const list = document.getElementById("rec-all-list");
  list.innerHTML = "";
  if (!products.length) {
    list.appendChild(el("div", "empty-state", "Add products to see recommendations."));
    return;
  }
  products.forEach((p) => {
    const result = recommendSellingPrice(p.purchase_price, overhead, p.est_monthly_units || 0, targetMargin);
    const row = el("div", "list-row");
    const main = el("div", "main");
    main.appendChild(el("div", "title", p.name));
    main.appendChild(el("div", "meta", `Current selling: ${money(p.selling_price)}`));
    row.appendChild(main);
    const displayVal = (p.est_monthly_units || 0) > 0 ? money(result.recommended_price) : "set units";
    row.appendChild(el("div", "value", displayVal));
    list.appendChild(row);
  });
}

function openExpenseSheet() {
  const body = el("div");

  const nameField = el("div", "field");
  nameField.appendChild(el("label", null, "Name (e.g. Rent, Electricity)"));
  const nameInput = el("input");
  nameInput.type = "text";
  nameField.appendChild(nameInput);
  body.appendChild(nameField);

  const row = el("div", "field-row");
  const amtField = el("div", "field");
  amtField.appendChild(el("label", null, "Amount"));
  const amtInput = el("input");
  amtInput.type = "number";
  amtInput.step = "0.01";
  amtField.appendChild(amtInput);
  row.appendChild(amtField);

  const freqField = el("div", "field");
  freqField.appendChild(el("label", null, "Frequency"));
  const freqSelect = el("select");
  ["monthly", "weekly", "daily", "one-time"].forEach((f) => {
    const opt = el("option", null, f);
    opt.value = f;
    freqSelect.appendChild(opt);
  });
  freqField.appendChild(freqSelect);
  row.appendChild(freqField);
  body.appendChild(row);

  const saveBtn = el("button", "btn btn-primary btn-block", "Add Expense");
  saveBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    const amount = parseFloat(amtInput.value);
    if (!name || isNaN(amount)) { showToast("Enter a name and numeric amount"); return; }
    await db.addExpense(name, amount, freqSelect.value);
    closeSheet();
    showToast("Expense added");
    await renderExpenses();
  });
  body.appendChild(saveBtn);

  openSheet("New Expense", body);
}

// ==================================================================
// REPORTS
// ==================================================================
function wireReports() {
  document.querySelectorAll("#report-range-chips .chip").forEach((chip) => {
    chip.addEventListener("click", async () => {
      document.querySelectorAll("#report-range-chips .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      state.reportRange = chip.dataset.range;
      await renderReports();
    });
  });

  document.getElementById("export-backup-btn").addEventListener("click", async () => {
    const data = await db.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `retail-manager-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Backup file downloaded");
  });

  document.getElementById("import-backup-btn").addEventListener("click", () => {
    document.getElementById("import-file-input").click();
  });
  document.getElementById("import-file-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm("Restoring will replace ALL current data with the backup file. Continue?")) {
      e.target.value = "";
      return;
    }
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await db.importAll(data);
      showToast("Backup restored — reloading…");
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      showToast("Could not read that backup file");
    }
    e.target.value = "";
  });
}

async function renderReports() {
  const { start, end } = resolveRange(state.reportRange);
  const transactions = await db.getTransactions({ start_date: start, end_date: end });
  const products = await db.getProducts();
  const costLookup = Object.fromEntries(products.map((p) => [p.id, p.purchase_price]));
  const nameLookup = Object.fromEntries(products.map((p) => [p.id, p.name]));

  const result = computeCogsAndProfit(transactions, costLookup);
  const overheadMonthly = await db.totalMonthlyExpenses();
  const overheadPeriod = proratedOverhead(overheadMonthly, start, end);
  const netProfit = result.gross_profit - overheadPeriod;

  const kpis = [
    ["Turnover", money(result.turnover)],
    ["Cost of Goods Sold", money(result.cogs)],
    ["Gross Profit", money(result.gross_profit)],
    ["Gross Margin %", result.gross_margin_pct.toFixed(1) + "%"],
    ["Overhead (Period)", money(overheadPeriod)],
    ["Net Profit", money(netProfit)],
  ];
  const kpiGrid = document.getElementById("report-kpis");
  kpiGrid.innerHTML = "";
  kpis.forEach(([label, value]) => {
    const card = el("div", "kpi-card");
    card.appendChild(el("div", "kpi-label", label));
    card.appendChild(el("div", "kpi-value", value));
    kpiGrid.appendChild(card);
  });

  const perProduct = {};
  transactions.forEach((t) => {
    if (t.ttype !== "sale") return;
    if (!perProduct[t.product_id]) perProduct[t.product_id] = { units: 0, revenue: 0, cogs: 0 };
    perProduct[t.product_id].units += t.quantity;
    perProduct[t.product_id].revenue += t.total;
    perProduct[t.product_id].cogs += (costLookup[t.product_id] || 0) * t.quantity;
  });

  const list = document.getElementById("report-product-list");
  list.innerHTML = "";
  const entries = Object.entries(perProduct).sort((a, b) => b[1].revenue - a[1].revenue);
  if (!entries.length) {
    list.appendChild(el("div", "empty-state", "No sales in this period yet."));
    return;
  }
  entries.forEach(([pid, data]) => {
    const profit = data.revenue - data.cogs;
    const marginPct = data.revenue ? (profit / data.revenue) * 100 : 0;
    const row = el("div", "list-row");
    const main = el("div", "main");
    main.appendChild(el("div", "title", nameLookup[pid] || `#${pid}`));
    main.appendChild(el("div", "meta", `${data.units} units sold · Margin ${marginPct.toFixed(1)}%`));
    row.appendChild(main);
    row.appendChild(el("div", "value", money(profit)));
    list.appendChild(row);
  });
}

// ==================================================================
// CAPITAL
// ==================================================================
function wireCapital() {
  document.getElementById("capital-initial-save").addEventListener("click", async () => {
    const val = parseFloat(document.getElementById("capital-initial-input").value);
    if (isNaN(val) || val < 0) { showToast("Enter a valid initial capital amount"); return; }
    await db.setSetting("initial_capital", val);
    showToast("Initial capital saved");
    await renderCapital();
  });

  document.getElementById("capital-cash-save").addEventListener("click", async () => {
    const val = parseFloat(document.getElementById("capital-cash-input").value);
    if (isNaN(val) || val < 0) { showToast("Enter a valid cash-in-hand amount"); return; }
    await db.setSetting("cash_in_hand", val);
    showToast("Cash in hand saved");
    await renderCapital();
  });
}

/** All-time total purchase-price cost of every unit ever sold — the default/reference cash-in-hand figure. */
async function computeDefaultCashInHand() {
  const allSales = await db.getTransactions({ ttype: "sale" });
  const products = await db.getProducts();
  const costLookup = Object.fromEntries(products.map((p) => [p.id, p.purchase_price]));
  const result = computeCogsAndProfit(allSales, costLookup);
  return result.cogs;
}

async function renderCapital() {
  const initialCapitalSaved = await db.getSetting("initial_capital", null);
  const initialCapital = initialCapitalSaved !== null ? parseFloat(initialCapitalSaved) : 0;

  const initialInput = document.getElementById("capital-initial-input");
  if (document.activeElement !== initialInput) {
    initialInput.value = initialCapitalSaved !== null ? initialCapital : "";
  }

  const defaultCash = await computeDefaultCashInHand();
  const cashSaved = await db.getSetting("cash_in_hand", null);
  const cashInHand = cashSaved !== null ? parseFloat(cashSaved) : defaultCash;

  const cashInput = document.getElementById("capital-cash-input");
  if (document.activeElement !== cashInput) {
    cashInput.value = cashInHand;
  }
  cashInput.placeholder = `Default: ${money(defaultCash)}`;

  const inv = await db.inventoryValue();
  const stockValue = inv.cost_value;
  const receivables = await db.getTotalOutstandingDues();
  const loanTotals = await db.getOtherCreditTotals();
  const loansGiven = loanTotals.givenOutstanding;
  const loansTaken = loanTotals.takenOutstanding;

  const currentCapital = stockValue + cashInHand + receivables + loansGiven - loansTaken;
  const capitalChange = currentCapital - initialCapital;

  const kpiGrid = document.getElementById("capital-kpis");
  kpiGrid.innerHTML = "";
  const kpis = [
    ["Inventory Value", money(stockValue)],
    ["Cash in Hand", money(cashInHand)],
    ["Customer Receivables", money(receivables)],
    ["Loans Given (outstanding)", money(loansGiven)],
    ["Loans Taken (outstanding)", "− " + money(loansTaken)],
    ["Current Capital", money(currentCapital)],
    ["Change vs Initial", (capitalChange >= 0 ? "+" : "") + money(capitalChange)],
  ];
  kpis.forEach(([label, value], i) => {
    const card = el("div", "kpi-card");
    card.appendChild(el("div", "kpi-label", label));
    const valEl = el("div", "kpi-value", value);
    if (label === "Loans Taken (outstanding)") valEl.classList.add("danger");
    if (label === "Change vs Initial") valEl.classList.add(capitalChange >= 0 ? "success" : "danger");
    card.appendChild(valEl);
    kpiGrid.appendChild(card);
  });

  const warning = document.getElementById("capital-deficit-warning");
  if (cashInHand < defaultCash) {
    const deficit = defaultCash - cashInHand;
    warning.textContent = `⚠ You are having a deficit of ${money(deficit)} in capital`;
    warning.style.display = "block";
  } else {
    warning.style.display = "none";
  }
}
