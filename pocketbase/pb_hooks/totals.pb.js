 
routerAdd(
  "GET",
  "/api/totals",
  (e) => {
    const groups = ["CASH", "DEBT", "INVESTMENT", "OTHER"];
    const totals = Object.fromEntries(groups.map((g) => [g, 0]));

    
    function latestBalanceValue(collection, ids, predicate) {
      if (!ids || ids.length === 0) return { value: 0, created: "" };
      const records = $app.findRecordsByIds(collection, ids);
      let bestCreated = "";
      let bestVal = 0;
      for (const rec of records) {
        if (!rec) continue;
        if (predicate && !predicate(rec)) continue;
        const created = rec.getString("created");
        const value = Number(rec.getFloat("value") || rec.get("value") || 0);
        if (!bestCreated || (created && created > bestCreated)) {
          bestCreated = created;
          bestVal = isFinite(value) ? value : 0;
        }
      }
      return { value: bestVal || 0, created: bestCreated };
    }

    
    function sumTransactions(ids, predicate) {
      if (!ids || ids.length === 0) return { sum: 0, count: 0 };
      const txns = $app.findRecordsByIds("transactions", ids);
      let total = 0;
      let count = 0;
      let excludedCount = 0;
      for (const t of txns) {
        if (!t) continue;
        if (predicate && !predicate(t)) continue;
        const isExcluded = !!t.getString("excluded");
        const isPending = !!t.getString("pending");
        if (isExcluded || isPending) {
          if (isExcluded) excludedCount++;
          continue;
        }
        const v = Number(t.getFloat("value") || t.get("value") || 0);
        if (isFinite(v)) {
          total += v;
          count += 1;
        }
      }
      return { sum: total, count, excludedCount };
    }

    
    const assets = $app.findRecordsByFilter(
      "assets",
      "excluded = null && sold = null",
      "",
      0,
      0
    );
    for (const a of assets) {
      if (!a) continue;
      const group = a.getString("balanceGroup") || "OTHER";
      const balanceIds = a.getStringSlice("balances");
      const pick = latestBalanceValue("assetBalances", balanceIds);
      const value = pick.value;
      totals[group] = (totals[group] || 0) + (isFinite(value) ? value : 0);
    }

    
    const accounts = $app.findRecordsByFilter(
      "accounts",
      "excluded = null && closed = null",
      "",
      0,
      0
    );
    for (const acc of accounts) {
      if (!acc) continue;
      const group = acc.getString("balanceGroup") || "OTHER";
      let value = 0;
      
      const autoAt = acc.getString("autoCalculated");
      let autoMode = "none";
      let autoFlagName = "";
      const btId = acc.getString("balanceType");
      let btName = "";
    if (btId) {
      try {
        const bt = $app.findRecordById("balanceTypes", btId);
        btName = (bt && bt.getString("name")) || "";
      } catch (err) {
        console.error("[totals] balanceType lookup failed", { btId, error: String(err) });
      }
    }

      if (autoAt) {
        autoMode = "dated";
      } else {
        autoFlagName = btName;
        const norm = (autoFlagName || "").toLowerCase().replace(/[^a-z]/g, "");
        if (norm === "autocalculated") {
          autoMode = "flag";
        }
        if (autoMode === "none") {
          const balanceIds = acc.getStringSlice("balances");
          const txnIds = acc.getStringSlice("transactions");
          if ((!balanceIds || balanceIds.length === 0) && (txnIds && txnIds.length > 0)) {
            autoMode = "inferred";
          }
        }
      }

      if (autoMode === "dated" || autoMode === "flag" || autoMode === "inferred") {
        const txnIds = acc.getStringSlice("transactions");
        const txAgg = sumTransactions(txnIds);
        value = txAgg.sum || 0;
      } else {
        const balanceIds = acc.getStringSlice("balances");
        const pick = latestBalanceValue("accountBalances", balanceIds);
        value = pick.value;
      }
      totals[group] = (totals[group] || 0) + (isFinite(value) ? value : 0);
    }

    const netWorth = groups.reduce((s, g) => s + (totals[g] || 0), 0);

    return e.json(200, {
      totalsByGroup: totals,
      netWorth,
    });
  },
  $apis.requireAuth()
);
