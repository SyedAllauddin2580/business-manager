/*
  logic.js
  Turnover / profit calculations and the expense-based selling price
  recommender. Pure functions, no DOM or storage access.
*/

function computeCogsAndProfit(transactions, costLookup) {
  let turnover = 0;
  let cogs = 0;
  for (const t of transactions) {
    if (t.ttype === "sale") {
      turnover += t.total;
      const unitCost = costLookup[t.product_id] || 0;
      cogs += unitCost * t.quantity;
    }
  }
  const gross_profit = turnover - cogs;
  const gross_margin_pct = turnover ? (gross_profit / turnover) * 100 : 0;
  return { turnover, cogs, gross_profit, gross_margin_pct };
}

function recommendSellingPrice(purchasePrice, monthlyOverhead, estMonthlyUnits, targetMarginPct) {
  const overheadPerUnit = estMonthlyUnits > 0 ? monthlyOverhead / estMonthlyUnits : 0;
  const baseCostPerUnit = purchasePrice + overheadPerUnit;

  let marginFraction = targetMarginPct / 100;
  if (marginFraction >= 1) marginFraction = 0.99;
  if (marginFraction < 0) marginFraction = 0;

  const recommendedPrice = baseCostPerUnit / (1 - marginFraction);
  const profitPerUnit = recommendedPrice - baseCostPerUnit;

  return {
    purchase_price: purchasePrice,
    overhead_per_unit: overheadPerUnit,
    base_cost_per_unit: baseCostPerUnit,
    recommended_price: recommendedPrice,
    profit_per_unit: profitPerUnit,
    target_margin_pct: targetMarginPct,
  };
}

function proratedOverhead(monthlyOverhead, startDateStr, endDateStr) {
  const d1 = new Date(startDateStr);
  const d2 = new Date(endDateStr);
  const daysInRange = Math.max(Math.round((d2 - d1) / 86400000) + 1, 1);
  return monthlyOverhead * (daysInRange / 30.44);
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  const then = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - then) / 86400000);
}
