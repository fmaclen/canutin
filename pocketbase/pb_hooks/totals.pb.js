/// <reference path="../pb_data/types.d.ts" />

// Totals endpoint: computes per-group balances and net worth
// Auth required (any auth collection)
routerAdd(
  "GET",
  "/api/totals",
  (e) => {
    const groups = ["CASH", "DEBT", "INVESTMENT", "OTHER"];
    /** @type {Record<string, number>} */
    const totals = Object.fromEntries(groups.map((g) => [g, 0]));

    /**
     * Returns the numeric value of the latest balance (by created) from a list of relation ids.
     * @param {"accountBalances"|"assetBalances"} collection
     * @param {string[]} ids
     */
    function latestBalanceValue(collection, ids, predicate) {
      if (!ids || ids.length === 0) return { value: 0, created: "" };
      /** @type {Array<core.Record|undefined>} */
      const records = $app.findRecordsByIds(collection, ids);
      let bestCreated = "";
      let bestVal = 0;
      for (const rec of records) {
        if (!rec) continue;
        if (predicate && !predicate(rec)) continue;
        // created is an autodate field; compare ISO strings lexicographically
        const created = rec.getString("created");
        const value = Number(rec.getFloat("value") || rec.get("value") || 0);
        if (!bestCreated || (created && created > bestCreated)) {
          bestCreated = created;
          bestVal = isFinite(value) ? value : 0;
        }
      }
      return { value: bestVal || 0, created: bestCreated };
    }

    /**
     * Sum transaction values for a list of ids, excluding pending/excluded.
     * @param {string[]} ids
     */
    function sumTransactions(ids, predicate) {
      if (!ids || ids.length === 0) return { sum: 0, count: 0 };
      /** @type {Array<core.Record|undefined>} */
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

    // Assets: use latest asset balance value; exclude sold/excluded
    /** @type {Array<core.Record|undefined>} */
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
      console.log(
        `[totals] asset ${a.getString("name") || a.getString("id")}: group=${group} value=${value} (latest balance at ${pick.created || "n/a"})`
      );
    }

    // Accounts: prefer autoCalculated txn sum; else latest account balance; exclude closed/excluded
    /** @type {Array<core.Record|undefined>} */
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
      // Determine auto-calc mode
      const autoAt = acc.getString("autoCalculated");
      let autoMode = "none"; // none | dated | flag | inferred
      let autoFlagName = "";
      const btId = acc.getString("balanceType");
      let btName = "";
      if (btId) {
        try {
          const bt = $app.findRecordById("balanceTypes", btId);
          btName = (bt && bt.getString("name")) || "";
        } catch {}
      }

      if (autoAt) {
        autoMode = "dated"; // user note: we won't use the date cutoff, only sum all tx
      } else {
        autoFlagName = btName;
        const norm = (autoFlagName || "").toLowerCase().replace(/[^a-z]/g, "");
        if (norm === "autocalculated") {
          autoMode = "flag";
        }
        if (autoMode === "none") {
          // Infer autoCalculated if there are transactions and no balances persisted
          const balanceIds = acc.getStringSlice("balances");
          const txnIds = acc.getStringSlice("transactions");
          if ((!balanceIds || balanceIds.length === 0) && (txnIds && txnIds.length > 0)) {
            autoMode = "inferred";
          }
        }
      }

      // Trace detection inputs
      try {
        const balancesCount = (acc.getStringSlice("balances") || []).length;
        const txnCount = (acc.getStringSlice("transactions") || []).length;
        console.log(
          `[totals][detect] account ${acc.getString("name") || acc.getString("id")} btName='${btName}' autoAt='${autoAt}' balances=${balancesCount} tx=${txnCount} => mode=${autoMode}`
        );
      } catch {}

      if (autoMode === "dated" || autoMode === "flag" || autoMode === "inferred") {
        // Per latest product decision: ignore autoAt cutoff and just sum ALL related txns
        const txnIds = acc.getStringSlice("transactions");
        const txAgg = sumTransactions(txnIds);
        value = txAgg.sum || 0;
        const balancesCount = (acc.getStringSlice("balances") || []).length;
        console.log(
          `[totals] account ${acc.getString("name") || acc.getString("id")}: group=${group} autoMode=${autoMode}${autoMode==="flag"?` flag='${autoFlagName}'`:''} balances=${balancesCount} txCount=${txAgg.count} txExcluded=${txAgg.excludedCount} sumAllTx=${txAgg.sum} => value=${value}`
        );
      } else {
        const balanceIds = acc.getStringSlice("balances");
        const pick = latestBalanceValue("accountBalances", balanceIds);
        value = pick.value;
        console.log(
          `[totals] account ${acc.getString("name") || acc.getString("id")}: group=${group} value=${value} (latest balance at ${pick.created || "n/a"})`
        );
      }
      totals[group] = (totals[group] || 0) + (isFinite(value) ? value : 0);
    }

    console.log(`[totals] groups: CASH=${totals.CASH} DEBT=${totals.DEBT} INVESTMENT=${totals.INVESTMENT} OTHER=${totals.OTHER}`);

    const netWorth = groups.reduce((s, g) => s + (totals[g] || 0), 0);

    return e.json(200, {
      totalsByGroup: totals,
      netWorth,
    });
  },
  $apis.requireAuth()
);

// Debug endpoint: inspect an account's balances and transactions
routerAdd(
  "GET",
  "/api/debug/account-balances",
  (e) => {
    const id = e.request.formValue("id");
    const name = e.request.formValue("name");
    const limitRaw = e.request.formValue("limit");
    const limit = Number(limitRaw || 20);

    if (!id && !name) {
      return e.json(400, { error: "Provide ?id=<accountId> or ?name=<account name>" });
    }

    /** @type {core.Record} */
    let acc;
    try {
      if (id) {
        acc = $app.findRecordById("accounts", id);
      } else {
        acc = $app.findFirstRecordByFilter(
          "accounts",
          `name = ${JSON.stringify(name)}`
        );
      }
    } catch (err) {
      return e.json(404, { error: `Account not found`, details: String(err) });
    }

    const balanceIds = acc.getStringSlice("balances") || [];
    const txnIds = acc.getStringSlice("transactions") || [];
    /** @type {Array<core.Record|undefined>} */
    const balances = $app.findRecordsByIds("accountBalances", balanceIds)
      .filter(Boolean);
    balances.sort((a, b) => {
      const as = a.getString("created") || "";
      const bs = b.getString("created") || "";
      return as < bs ? -1 : as > bs ? 1 : 0;
    });

    const latest = balances.length ? balances[balances.length - 1] : undefined;
    const latestValue = latest ? Number(latest.getFloat("value") || latest.get("value") || 0) : null;
    const latestCreated = latest ? latest.getString("created") : null;

    /** @type {Array<core.Record|undefined>} */
    const txns = $app.findRecordsByIds("transactions", txnIds).filter(Boolean);
    txns.sort((a, b) => {
      const as = a.getString("date") || "";
      const bs = b.getString("date") || "";
      return as < bs ? -1 : as > bs ? 1 : 0;
    });

    const txPreview = txns.slice(-limit).map((t) => ({
      id: t.getString("id"),
      date: t.getString("date"),
      value: Number(t.getFloat("value") || t.get("value") || 0),
      excluded: !!t.getString("excluded"),
      pending: !!t.getString("pending"),
      description: t.getString("description"),
    }));

    const balPreview = balances.slice(-limit).map((b) => ({
      id: b.getString("id"),
      created: b.getString("created"),
      value: Number(b.getFloat("value") || b.get("value") || 0),
    }));

    return e.json(200, {
      account: {
        id: acc.getString("id"),
        name: acc.getString("name"),
        balanceGroup: acc.getString("balanceGroup"),
        autoCalculated: acc.getString("autoCalculated"),
        balanceType: acc.getString("balanceType"),
        balancesCount: balances.length,
        transactionsCount: txns.length,
      },
      balances: {
        latest: latest ? { created: latestCreated, value: latestValue } : null,
        last: balPreview,
      },
      transactions: {
        last: txPreview,
        excludedCount: txPreview.filter((t) => t.excluded).length,
        pendingCount: txPreview.filter((t) => t.pending).length,
      },
    });
  },
  $apis.requireAuth()
);
