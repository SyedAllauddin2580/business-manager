/*
  db.js
  IndexedDB persistence layer. Everything lives locally in the browser's
  storage for this device — nothing is sent anywhere. Mirrors the schema
  of the desktop (Python/SQLite) version of Retail Manager.
*/

const DB_NAME = "retail_manager_db";
const DB_VERSION = 3;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains("categories")) {
        const store = db.createObjectStore("categories", { keyPath: "id", autoIncrement: true });
        store.createIndex("name", "name", { unique: true });
      }

      if (!db.objectStoreNames.contains("products")) {
        const store = db.createObjectStore("products", { keyPath: "id", autoIncrement: true });
        store.createIndex("name", "name", { unique: false });
        store.createIndex("sku", "sku", { unique: false });
        store.createIndex("category_id", "category_id", { unique: false });
      }

      if (!db.objectStoreNames.contains("price_history")) {
        const store = db.createObjectStore("price_history", { keyPath: "id", autoIncrement: true });
        store.createIndex("product_id", "product_id", { unique: false });
      }

      if (!db.objectStoreNames.contains("transactions")) {
        const store = db.createObjectStore("transactions", { keyPath: "id", autoIncrement: true });
        store.createIndex("product_id", "product_id", { unique: false });
        store.createIndex("tdate", "tdate", { unique: false });
        store.createIndex("ttype", "ttype", { unique: false });
      }

      if (!db.objectStoreNames.contains("expenses")) {
        db.createObjectStore("expenses", { keyPath: "id", autoIncrement: true });
      }

      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains("customers")) {
        const store = db.createObjectStore("customers", { keyPath: "id", autoIncrement: true });
        store.createIndex("name", "name", { unique: false });
      }

      if (!db.objectStoreNames.contains("credit_entries")) {
        const store = db.createObjectStore("credit_entries", { keyPath: "id", autoIncrement: true });
        store.createIndex("customer_id", "customer_id", { unique: false });
        store.createIndex("date", "date", { unique: false });
      }

      if (!db.objectStoreNames.contains("other_credits")) {
        const store = db.createObjectStore("other_credits", { keyPath: "id", autoIncrement: true });
        store.createIndex("party_name", "party_name", { unique: false });
      }

      if (!db.objectStoreNames.contains("other_credit_entries")) {
        const store = db.createObjectStore("other_credit_entries", { keyPath: "id", autoIncrement: true });
        store.createIndex("other_credit_id", "other_credit_id", { unique: false });
        store.createIndex("date", "date", { unique: false });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

function tx(db, storeNames, mode = "readonly") {
  return db.transaction(storeNames, mode);
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function cursorToArray(store, filterFn = null) {
  return new Promise((resolve, reject) => {
    const results = [];
    const request = store.openCursor();
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if (!filterFn || filterFn(cursor.value)) results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

class Database {
  constructor(idb) {
    this.idb = idb;
  }

  static async create() {
    const idb = await openDatabase();
    return new Database(idb);
  }

  nowISO() {
    return new Date().toISOString().slice(0, 19);
  }

  // ------------------------------------------------------------------
  // Categories
  // ------------------------------------------------------------------
  async addCategory(name) {
    const store = tx(this.idb, "categories", "readwrite").objectStore("categories");
    const existing = await cursorToArray(store, (c) => c.name === name);
    if (existing.length) return false;
    await reqToPromise(store.add({ name }));
    return true;
  }

  async getCategories() {
    const store = tx(this.idb, "categories").objectStore("categories");
    const all = await cursorToArray(store);
    return all.sort((a, b) => a.name.localeCompare(b.name));
  }

  async deleteCategory(id) {
    const store = tx(this.idb, "categories", "readwrite").objectStore("categories");
    await reqToPromise(store.delete(id));
  }

  // ------------------------------------------------------------------
  // Products
  // ------------------------------------------------------------------
  async addProduct(p) {
    const now = this.nowISO();
    const record = {
      sku: p.sku || null,
      name: p.name,
      category_id: p.category_id || null,
      unit: p.unit || "pcs",
      purchase_price: p.purchase_price || 0,
      selling_price: p.selling_price || 0,
      stock_qty: p.stock_qty || 0,
      reorder_level: p.reorder_level || 0,
      est_monthly_units: p.est_monthly_units || 0,
      created_at: now,
      updated_at: now,
    };
    const store = tx(this.idb, "products", "readwrite").objectStore("products");
    const id = await reqToPromise(store.add(record));
    await this._logPrice(id, record.purchase_price, record.selling_price, "Initial price");
    return id;
  }

  async updateProduct(id, fields) {
    const store = tx(this.idb, "products", "readwrite").objectStore("products");
    const existing = await reqToPromise(store.get(id));
    if (!existing) return;
    const updated = { ...existing, ...fields, updated_at: this.nowISO() };
    await reqToPromise(store.put(updated));
  }

  async updatePrices(id, purchase_price, selling_price, note = "Price update") {
    await this.updateProduct(id, { purchase_price, selling_price });
    await this._logPrice(id, purchase_price, selling_price, note);
  }

  async _logPrice(product_id, purchase_price, selling_price, note) {
    const store = tx(this.idb, "price_history", "readwrite").objectStore("price_history");
    await reqToPromise(
      store.add({ product_id, purchase_price, selling_price, changed_at: this.nowISO(), note })
    );
  }

  async getPriceHistory(product_id) {
    const store = tx(this.idb, "price_history").objectStore("price_history");
    const all = await cursorToArray(store, (h) => h.product_id === product_id);
    return all.sort((a, b) => (a.changed_at < b.changed_at ? 1 : -1));
  }

  async getProducts({ search = null, category_id = null } = {}) {
    const productStore = tx(this.idb, "products").objectStore("products");
    let products = await cursorToArray(productStore);

    if (search) {
      const s = search.toLowerCase();
      products = products.filter(
        (p) => p.name.toLowerCase().includes(s) || (p.sku || "").toLowerCase().includes(s)
      );
    }
    if (category_id) {
      products = products.filter((p) => p.category_id === category_id);
    }

    const categories = await this.getCategories();
    const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));
    products.forEach((p) => (p.category_name = catMap[p.category_id] || null));

    return products.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getProduct(id) {
    const store = tx(this.idb, "products").objectStore("products");
    return reqToPromise(store.get(id));
  }

  async deleteProduct(id) {
    const store = tx(this.idb, "products", "readwrite").objectStore("products");
    await reqToPromise(store.delete(id));
    const histStore = tx(this.idb, "price_history", "readwrite").objectStore("price_history");
    const history = await cursorToArray(histStore, (h) => h.product_id === id);
    for (const h of history) await reqToPromise(histStore.delete(h.id));
  }

  async countProducts() {
    const store = tx(this.idb, "products").objectStore("products");
    return reqToPromise(store.count());
  }

  async inventoryValue() {
    const products = await this.getProducts();
    let cost_value = 0;
    let retail_value = 0;
    for (const p of products) {
      cost_value += p.stock_qty * p.purchase_price;
      retail_value += p.stock_qty * p.selling_price;
    }
    return { cost_value, retail_value };
  }

  async getLowStockProducts() {
    const products = await this.getProducts();
    return products
      .filter((p) => p.reorder_level > 0 && p.stock_qty <= p.reorder_level)
      .sort((a, b) => a.stock_qty - b.stock_qty);
  }

  // ------------------------------------------------------------------
  // Transactions
  // ------------------------------------------------------------------
  async addTransaction(product_id, ttype, quantity, unit_price, tdate = null, notes = "") {
    tdate = tdate || new Date().toISOString().slice(0, 10);
    const total = quantity * unit_price;

    const txnStore = tx(this.idb, "transactions", "readwrite").objectStore("transactions");
    await reqToPromise(txnStore.add({ product_id, ttype, quantity, unit_price, total, tdate, notes }));

    const productStore = tx(this.idb, "products", "readwrite").objectStore("products");
    const product = await reqToPromise(productStore.get(product_id));
    if (product) {
      let newQty = product.stock_qty;
      if (ttype === "sale") newQty -= quantity;
      else newQty += quantity; // purchase or adjustment
      product.stock_qty = newQty;
      product.updated_at = this.nowISO();
      await reqToPromise(productStore.put(product));
    }
  }

  async getTransactions({ start_date = null, end_date = null, ttype = null, product_id = null } = {}) {
    const txnStore = tx(this.idb, "transactions").objectStore("transactions");
    let txns = await cursorToArray(txnStore);

    if (start_date) txns = txns.filter((t) => t.tdate >= start_date);
    if (end_date) txns = txns.filter((t) => t.tdate <= end_date);
    if (ttype) txns = txns.filter((t) => t.ttype === ttype);
    if (product_id) txns = txns.filter((t) => t.product_id === product_id);

    const products = await this.getProducts();
    const prodMap = Object.fromEntries(products.map((p) => [p.id, p]));
    txns.forEach((t) => {
      const p = prodMap[t.product_id];
      t.product_name = p ? p.name : `#${t.product_id}`;
      t.sku = p ? p.sku : null;
    });

    return txns.sort((a, b) => (a.tdate < b.tdate ? 1 : a.tdate > b.tdate ? -1 : b.id - a.id));
  }

  async deleteTransaction(id) {
    const store = tx(this.idb, "transactions", "readwrite").objectStore("transactions");
    await reqToPromise(store.delete(id));
  }

  /**
   * Edits an existing transaction in place, correctly reversing the stock
   * effect of the OLD values and applying the stock effect of the NEW
   * values — including handling a change of product, type, or quantity.
   * fields may include any of: product_id, ttype, quantity, unit_price,
   * tdate, notes. Only the keys provided are changed.
   *
   * Note: this does not touch any linked credit-sale ledger entry (there
   * is no stored link between a transaction and a credit charge) — if the
   * original sale was on credit, adjust the customer's ledger separately.
   */
  async updateTransaction(id, fields) {
    // Read with its own short-lived transaction — IndexedDB transactions
    // auto-commit once you await unrelated operations on another store,
    // so we must NOT hold this transaction open across the product
    // updates below and reuse it later for the final write.
    const readStore = tx(this.idb, "transactions").objectStore("transactions");
    const existing = await reqToPromise(readStore.get(id));
    if (!existing) return;

    const oldProductId = existing.product_id;
    const oldType = existing.ttype;
    const oldQty = existing.quantity;

    const newProductId = fields.product_id !== undefined ? fields.product_id : oldProductId;
    const newType = fields.ttype !== undefined ? fields.ttype : oldType;
    const newQty = fields.quantity !== undefined ? fields.quantity : oldQty;
    const newPrice = fields.unit_price !== undefined ? fields.unit_price : existing.unit_price;

    const productStore = tx(this.idb, "products", "readwrite").objectStore("products");

    if (oldProductId === newProductId) {
      const product = await reqToPromise(productStore.get(oldProductId));
      if (product) {
        let qty = product.stock_qty;
        qty += oldType === "sale" ? oldQty : -oldQty; // reverse old effect
        qty += newType === "sale" ? -newQty : newQty; // apply new effect
        product.stock_qty = qty;
        product.updated_at = this.nowISO();
        await reqToPromise(productStore.put(product));
      }
    } else {
      const oldProductStore = tx(this.idb, "products", "readwrite").objectStore("products");
      const oldProduct = await reqToPromise(oldProductStore.get(oldProductId));
      if (oldProduct) {
        oldProduct.stock_qty += oldType === "sale" ? oldQty : -oldQty;
        oldProduct.updated_at = this.nowISO();
        await reqToPromise(oldProductStore.put(oldProduct));
      }
      const newProductStore = tx(this.idb, "products", "readwrite").objectStore("products");
      const newProduct = await reqToPromise(newProductStore.get(newProductId));
      if (newProduct) {
        newProduct.stock_qty += newType === "sale" ? -newQty : newQty;
        newProduct.updated_at = this.nowISO();
        await reqToPromise(newProductStore.put(newProduct));
      }
    }

    const updated = {
      ...existing,
      product_id: newProductId,
      ttype: newType,
      quantity: newQty,
      unit_price: newPrice,
      total: newQty * newPrice,
      tdate: fields.tdate !== undefined ? fields.tdate : existing.tdate,
      notes: fields.notes !== undefined ? fields.notes : existing.notes,
    };
    // Fresh transaction for the write — the original readStore transaction
    // is long since auto-committed by this point.
    const writeStore = tx(this.idb, "transactions", "readwrite").objectStore("transactions");
    await reqToPromise(writeStore.put(updated));
  }

  // ------------------------------------------------------------------
  // Customers & Credit (buy-now-pay-later dues)
  // ------------------------------------------------------------------
  async addCustomer(name, phone = "", notes = "") {
    const store = tx(this.idb, "customers", "readwrite").objectStore("customers");
    return reqToPromise(store.add({ name, phone, notes, created_at: this.nowISO() }));
  }

  async updateCustomer(id, fields) {
    const store = tx(this.idb, "customers", "readwrite").objectStore("customers");
    const existing = await reqToPromise(store.get(id));
    if (!existing) return;
    await reqToPromise(store.put({ ...existing, ...fields }));
  }

  async getCustomers() {
    const store = tx(this.idb, "customers").objectStore("customers");
    const all = await cursorToArray(store);
    return all.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Looks up a customer by name (case-insensitive, trimmed exact match).
   * If none exists yet, creates a bare-bones customer record with just
   * that name — phone/notes can be filled in later from the Credit tab.
   * Returns the customer id either way.
   */
  async findOrCreateCustomerByName(name) {
    name = name.trim();
    const customers = await this.getCustomers();
    const match = customers.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (match) return match.id;
    return this.addCustomer(name, "", "");
  }

  async getCustomer(id) {
    const store = tx(this.idb, "customers").objectStore("customers");
    return reqToPromise(store.get(id));
  }

  async deleteCustomer(id) {
    const store = tx(this.idb, "customers", "readwrite").objectStore("customers");
    await reqToPromise(store.delete(id));
    const entryStore = tx(this.idb, "credit_entries", "readwrite").objectStore("credit_entries");
    const entries = await cursorToArray(entryStore, (e) => e.customer_id === id);
    for (const e of entries) await reqToPromise(entryStore.delete(e.id));
  }

  async _addCreditEntry(customer_id, entryType, amount, date, notes, product_id = null) {
    const store = tx(this.idb, "credit_entries", "readwrite").objectStore("credit_entries");
    await reqToPromise(
      store.add({ customer_id, entry_type: entryType, amount, date, notes, product_id })
    );
  }

  /**
   * Record a sale made on credit. Always logs the full sale amount as a
   * charge; if amount_paid_now > 0, also logs an immediate payment, so
   * the ledger stays transparent about what happened at time of sale.
   */
  async addCreditSale({ customer_id, product_id, quantity, unit_price, amount_paid_now = 0, date = null, notes = "" }) {
    date = date || new Date().toISOString().slice(0, 10);
    await this.addTransaction(product_id, "sale", quantity, unit_price, date, notes);
    const total = quantity * unit_price;
    const product = await this.getProduct(product_id);
    const label = product ? product.name : `Product #${product_id}`;
    await this._addCreditEntry(customer_id, "charge", total, date, `Credit sale: ${label}${notes ? " — " + notes : ""}`, product_id);
    if (amount_paid_now > 0) {
      await this._addCreditEntry(customer_id, "payment", amount_paid_now, date, "Paid at time of sale");
    }
  }

  async addCreditPayment(customer_id, amount, date = null, notes = "") {
    date = date || new Date().toISOString().slice(0, 10);
    await this._addCreditEntry(customer_id, "payment", amount, date, notes || "Repayment");
  }

  async getCreditLedger(customer_id) {
    const store = tx(this.idb, "credit_entries").objectStore("credit_entries");
    const entries = await cursorToArray(store, (e) => e.customer_id === customer_id);
    return entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
  }

  async getCustomersWithBalances() {
    const customers = await this.getCustomers();
    const store = tx(this.idb, "credit_entries").objectStore("credit_entries");
    const allEntries = await cursorToArray(store);

    return customers.map((c) => {
      const entries = allEntries.filter((e) => e.customer_id === c.id);
      let balance = 0;
      let lastActivity = null; // date of the most recent charge/payment; null if never transacted
      for (const e of entries) {
        balance += e.entry_type === "charge" ? e.amount : -e.amount;
        if (!lastActivity || e.date > lastActivity) lastActivity = e.date;
      }
      return { ...c, balance, last_activity: lastActivity, entry_count: entries.length };
    });
  }

  async getTotalOutstandingDues() {
    const customers = await this.getCustomersWithBalances();
    return customers.reduce((sum, c) => sum + Math.max(c.balance, 0), 0);
  }

  // ------------------------------------------------------------------
  // Other Credit — loans/borrowings between the business and a third
  // party, in either direction. Separate from customer sales credit.
  //   direction "taken": the business borrowed money (business owes them)
  //   direction "given": the business lent money out (they owe the business)
  // ------------------------------------------------------------------
  async addOtherCredit(party_name, direction, principal_amount, date, notes = "") {
    date = date || new Date().toISOString().slice(0, 10);
    const store = tx(this.idb, "other_credits", "readwrite").objectStore("other_credits");
    const id = await reqToPromise(
      store.add({ party_name, direction, notes, created_at: this.nowISO() })
    );
    await this._addOtherCreditEntry(id, "charge", principal_amount, date, notes || "Initial amount");
    return id;
  }

  async updateOtherCredit(id, fields) {
    const store = tx(this.idb, "other_credits", "readwrite").objectStore("other_credits");
    const existing = await reqToPromise(store.get(id));
    if (!existing) return;
    await reqToPromise(store.put({ ...existing, ...fields }));
  }

  async deleteOtherCredit(id) {
    const store = tx(this.idb, "other_credits", "readwrite").objectStore("other_credits");
    await reqToPromise(store.delete(id));
    const entryStore = tx(this.idb, "other_credit_entries", "readwrite").objectStore("other_credit_entries");
    const entries = await cursorToArray(entryStore, (e) => e.other_credit_id === id);
    for (const e of entries) await reqToPromise(entryStore.delete(e.id));
  }

  async _addOtherCreditEntry(other_credit_id, entryType, amount, date, notes) {
    const store = tx(this.idb, "other_credit_entries", "readwrite").objectStore("other_credit_entries");
    await reqToPromise(store.add({ other_credit_id, entry_type: entryType, amount, date, notes }));
  }

  async addOtherCreditPayment(other_credit_id, amount, date = null, notes = "") {
    date = date || new Date().toISOString().slice(0, 10);
    await this._addOtherCreditEntry(other_credit_id, "payment", amount, date, notes || "Repayment");
  }

  async getOtherCreditLedger(other_credit_id) {
    const store = tx(this.idb, "other_credit_entries").objectStore("other_credit_entries");
    const entries = await cursorToArray(store, (e) => e.other_credit_id === other_credit_id);
    return entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
  }

  async getOtherCreditsWithBalances() {
    const store = tx(this.idb, "other_credits").objectStore("other_credits");
    const records = await cursorToArray(store);
    const entryStore = tx(this.idb, "other_credit_entries").objectStore("other_credit_entries");
    const allEntries = await cursorToArray(entryStore);

    return records
      .map((r) => {
        const entries = allEntries.filter((e) => e.other_credit_id === r.id);
        let balance = 0;
        let lastActivity = null;
        for (const e of entries) {
          balance += e.entry_type === "charge" ? e.amount : -e.amount;
          if (!lastActivity || e.date > lastActivity) lastActivity = e.date;
        }
        return { ...r, balance, last_activity: lastActivity, entry_count: entries.length };
      })
      .sort((a, b) => a.party_name.localeCompare(b.party_name));
  }

  async getOtherCreditTotals() {
    const records = await this.getOtherCreditsWithBalances();
    let takenOutstanding = 0;
    let givenOutstanding = 0;
    for (const r of records) {
      if (r.balance <= 0) continue;
      if (r.direction === "taken") takenOutstanding += r.balance;
      else givenOutstanding += r.balance;
    }
    return { takenOutstanding, givenOutstanding };
  }

  // ------------------------------------------------------------------
  // Expenses
  // ------------------------------------------------------------------
  async addExpense(name, amount, frequency = "monthly") {
    const store = tx(this.idb, "expenses", "readwrite").objectStore("expenses");
    await reqToPromise(store.add({ name, amount, frequency, date_added: this.nowISO() }));
  }

  async getExpenses() {
    const store = tx(this.idb, "expenses").objectStore("expenses");
    const all = await cursorToArray(store);
    return all.sort((a, b) => a.name.localeCompare(b.name));
  }

  async deleteExpense(id) {
    const store = tx(this.idb, "expenses", "readwrite").objectStore("expenses");
    await reqToPromise(store.delete(id));
  }

  async totalMonthlyExpenses() {
    const expenses = await this.getExpenses();
    let total = 0;
    for (const e of expenses) {
      if (e.frequency === "monthly") total += e.amount;
      else if (e.frequency === "weekly") total += e.amount * 4.33;
      else if (e.frequency === "daily") total += e.amount * 30;
      // one-time expenses excluded from recurring overhead
    }
    return total;
  }

  // ------------------------------------------------------------------
  // Dashboard analytics
  // ------------------------------------------------------------------
  async getDailyTurnover({ start_date = null, end_date = null } = {}) {
    const txns = await this.getTransactions({ start_date, end_date, ttype: "sale" });
    const byDate = {};
    for (const t of txns) {
      byDate[t.tdate] = (byDate[t.tdate] || 0) + t.total;
    }
    return Object.entries(byDate)
      .map(([tdate, revenue]) => ({ tdate, revenue }))
      .sort((a, b) => (a.tdate > b.tdate ? 1 : -1));
  }

  async getCategorySales({ start_date = null, end_date = null } = {}) {
    const txns = await this.getTransactions({ start_date, end_date, ttype: "sale" });
    const products = await this.getProducts();
    const prodMap = Object.fromEntries(products.map((p) => [p.id, p]));
    const byCat = {};
    for (const t of txns) {
      const p = prodMap[t.product_id];
      const catName = (p && p.category_name) || "Uncategorized";
      byCat[catName] = (byCat[catName] || 0) + t.total;
    }
    return Object.entries(byCat)
      .map(([category_name, revenue]) => ({ category_name, revenue }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  async getTopProducts({ start_date = null, end_date = null, limit = 5, by = "revenue" } = {}) {
    const txns = await this.getTransactions({ start_date, end_date, ttype: "sale" });
    const byProduct = {};
    for (const t of txns) {
      if (!byProduct[t.product_id]) {
        byProduct[t.product_id] = { name: t.product_name, revenue: 0, units: 0 };
      }
      byProduct[t.product_id].revenue += t.total;
      byProduct[t.product_id].units += t.quantity;
    }
    const list = Object.values(byProduct);
    list.sort((a, b) => b[by] - a[by]);
    return list.slice(0, limit);
  }

  // ------------------------------------------------------------------
  // Settings
  // ------------------------------------------------------------------
  async setSetting(key, value) {
    const store = tx(this.idb, "settings", "readwrite").objectStore("settings");
    await reqToPromise(store.put({ key, value: String(value) }));
  }

  async getSetting(key, defaultValue = null) {
    const store = tx(this.idb, "settings").objectStore("settings");
    const row = await reqToPromise(store.get(key));
    return row ? row.value : defaultValue;
  }

  // ------------------------------------------------------------------
  // Backup / restore (export the whole database as JSON)
  // ------------------------------------------------------------------
  async exportAll() {
    const storeNames = ["categories", "products", "price_history", "transactions", "expenses",
                         "settings", "customers", "credit_entries", "other_credits", "other_credit_entries"];
    const data = {};
    for (const name of storeNames) {
      const store = tx(this.idb, name).objectStore(name);
      data[name] = await cursorToArray(store);
    }
    return data;
  }

  async importAll(data) {
    const storeNames = ["categories", "products", "price_history", "transactions", "expenses",
                         "settings", "customers", "credit_entries", "other_credits", "other_credit_entries"];
    for (const name of storeNames) {
      if (!data[name]) continue;
      const store = tx(this.idb, name, "readwrite").objectStore(name);
      await reqToPromise(store.clear());
      for (const record of data[name]) {
        await reqToPromise(store.put(record));
      }
    }
  }
}
