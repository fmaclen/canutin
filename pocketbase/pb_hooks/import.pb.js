/// <reference path="../pb_data/types.d.ts" />

routerAdd("POST", "/api/canutin/import", function (e) {
	function normalizeDescription(desc) {
		return (desc || "").trim().replace(/\s+/g, " ").toLowerCase();
	}

	function datePart(isoDate) {
		return isoDate.split("T")[0].split(" ")[0];
	}

	function pbDateRange(isoDate) {
		var start = datePart(isoDate) + " 00:00:00.000Z";
		var dateObj = new Date(isoDate);
		dateObj.setUTCDate(dateObj.getUTCDate() + 1);
		var end = dateObj.toISOString().split("T")[0] + " 00:00:00.000Z";
		return { start: start, end: end };
	}

	function findOrCreate(collectionName, filter, params, data) {
		try {
			return { record: $app.findFirstRecordByFilter(collectionName, filter, params), created: false };
		} catch (err) {
			var collection = $app.findCollectionByNameOrId(collectionName);
			var record = new Record(collection);
			for (var key in data) {
				record.set(key, data[key]);
			}
			$app.save(record);
			return { record: record, created: true };
		}
	}

	function cachedFindOrCreate(cache, cacheKey, collectionName, filter, params, data) {
		if (cache[cacheKey]) return cache[cacheKey];
		var res = findOrCreate(collectionName, filter, params, data);
		cache[cacheKey] = res.record.id;
		return res.record.id;
	}

	var info = e.requestInfo();
	var auth = info.auth;
	var body = info.body;

	if (!body.sessionLabel) throw new BadRequestError("sessionLabel is required");
	if (!body.accounts && !body.assets && !body.transactions) {
		throw new BadRequestError("At least one of accounts, assets, or transactions is required");
	}

	var ownerId = auth.id;
	var result = {
		sessionId: "",
		accounts: { created: 0, existing: 0 },
		assets: { created: 0, existing: 0 },
		transactions: { created: 0, skipped: 0 },
		accountBalances: { created: 0, skipped: 0 },
		assetBalances: { created: 0, skipped: 0 }
	};

	var sessionsCollection = $app.findCollectionByNameOrId("importSessions");
	var session = new Record(sessionsCollection);
	session.set("label", body.sessionLabel);
	session.set("owner", ownerId);
	session.set("recordsCreated", 0);
	session.set("recordsSkipped", 0);
	session.set("status", "pending");
	$app.save(session);
	result.sessionId = session.id;

	var balanceTypeCache = {};
	var labelCache = {};
	var accountNameIndex = {};

	if (body.accounts) {
		for (var i = 0; i < body.accounts.length; i++) {
			var account = body.accounts[i];
			var institution = account.institution || "";

			var btCacheKey = account.balanceType + "::" + ownerId;
			var balanceTypeId = cachedFindOrCreate(
				balanceTypeCache, btCacheKey,
				"balanceTypes",
				"name = {:name} && owner = {:owner}",
				{ name: account.balanceType, owner: ownerId },
				{ name: account.balanceType, owner: ownerId }
			);

			var acctFilter = institution
				? "name = {:name} && institution = {:inst} && balanceGroup = {:bg} && owner = {:owner}"
				: "name = {:name} && balanceGroup = {:bg} && owner = {:owner}";
			var acctParams = institution
				? { name: account.name, inst: institution, bg: account.balanceGroup, owner: ownerId }
				: { name: account.name, bg: account.balanceGroup, owner: ownerId };

			var now = new Date().toISOString();
			var acctResult = findOrCreate("accounts", acctFilter, acctParams, {
				name: account.name,
				institution: institution,
				balanceGroup: account.balanceGroup,
				balanceType: balanceTypeId,
				autoCalculated: account.autoCalculated ? now : "",
				closed: account.closed ? now : "",
				excluded: account.excluded ? now : "",
				owner: ownerId,
				importSession: session.id
			});

			var acctKey = account.name + "|" + institution + "|" + account.balanceGroup;
			accountNameIndex[acctKey] = acctResult.record.id;

			if (acctResult.created) {
				result.accounts.created++;
			} else {
				result.accounts.existing++;
			}

			if (account.balance) {
				var abRange = pbDateRange(account.balance.asOf);
				var abExists = false;
				try {
					$app.findFirstRecordByFilter(
						"accountBalances",
						"account = {:account} && asOf >= {:start} && asOf < {:end} && value = {:value} && owner = {:owner}",
						{ account: acctResult.record.id, start: abRange.start, end: abRange.end, value: account.balance.value, owner: ownerId }
					);
					abExists = true;
				} catch (err) { /* not found */ }

				if (!abExists) {
					var abColl = $app.findCollectionByNameOrId("accountBalances");
					var abRec = new Record(abColl);
					abRec.set("account", acctResult.record.id);
					abRec.set("value", account.balance.value);
					abRec.set("asOf", account.balance.asOf);
					abRec.set("owner", ownerId);
					abRec.set("importSession", session.id);
					$app.save(abRec);
					result.accountBalances.created++;
				} else {
					result.accountBalances.skipped++;
				}
			}
		}
	}

	if (body.assets) {
		for (var j = 0; j < body.assets.length; j++) {
			var asset = body.assets[j];
			var symbol = asset.symbol || "";

			var abtCacheKey = asset.balanceType + "::" + ownerId;
			var aBalanceTypeId = cachedFindOrCreate(
				balanceTypeCache, abtCacheKey,
				"balanceTypes",
				"name = {:name} && owner = {:owner}",
				{ name: asset.balanceType, owner: ownerId },
				{ name: asset.balanceType, owner: ownerId }
			);

			var assetFilter = symbol
				? "name = {:name} && symbol = {:symbol} && owner = {:owner}"
				: "name = {:name} && owner = {:owner}";
			var assetParams = symbol
				? { name: asset.name, symbol: symbol, owner: ownerId }
				: { name: asset.name, owner: ownerId };

			var anow = new Date().toISOString();
			var assetRes = findOrCreate("assets", assetFilter, assetParams, {
				name: asset.name,
				symbol: symbol,
				balanceGroup: asset.balanceGroup,
				balanceType: aBalanceTypeId,
				type: asset.type,
				sold: asset.sold ? anow : "",
				excluded: asset.excluded ? anow : "",
				owner: ownerId,
				importSession: session.id
			});

			if (assetRes.created) {
				result.assets.created++;
			} else {
				result.assets.existing++;
			}

			if (asset.balance) {
				var mv = asset.balance.marketValue || 0;
				var asbRange = pbDateRange(asset.balance.asOf);
				var asbExists = false;
				try {
					$app.findFirstRecordByFilter(
						"assetBalances",
						"asset = {:asset} && asOf >= {:start} && asOf < {:end} && marketValue = {:mv} && owner = {:owner}",
						{ asset: assetRes.record.id, start: asbRange.start, end: asbRange.end, mv: mv, owner: ownerId }
					);
					asbExists = true;
				} catch (err) { /* not found */ }

				if (!asbExists) {
					var asbColl = $app.findCollectionByNameOrId("assetBalances");
					var asbRec = new Record(asbColl);
					asbRec.set("asset", assetRes.record.id);
					asbRec.set("marketValue", mv);
					asbRec.set("bookValue", asset.balance.bookValue || 0);
					asbRec.set("quantity", asset.balance.quantity || 0);
					asbRec.set("marketPrice", asset.balance.marketPrice || 0);
					asbRec.set("bookPrice", asset.balance.bookPrice || 0);
					asbRec.set("asOf", asset.balance.asOf);
					asbRec.set("owner", ownerId);
					asbRec.set("importSession", session.id);
					$app.save(asbRec);
					result.assetBalances.created++;
				} else {
					result.assetBalances.skipped++;
				}
			}
		}
	}

	if (body.transactions) {
		for (var k = 0; k < body.transactions.length; k++) {
			var tx = body.transactions[k];

			var accountId = null;
			var keys = Object.keys(accountNameIndex);
			for (var n = 0; n < keys.length; n++) {
				if (keys[n].indexOf(tx.accountName + "|") === 0) {
					accountId = accountNameIndex[keys[n]];
					break;
				}
			}

			if (!accountId) {
				try {
					var found = $app.findFirstRecordByFilter(
						"accounts",
						"name = {:name} && owner = {:owner}",
						{ name: tx.accountName, owner: ownerId }
					);
					accountId = found.id;
					accountNameIndex[tx.accountName + "||"] = accountId;
				} catch (err) {
					result.transactions.skipped++;
					continue;
				}
			}

			var isDuplicate = false;
			if (tx.externalId) {
				try {
					$app.findFirstRecordByFilter(
						"transactions",
						"account = {:account} && externalId = {:eid} && owner = {:owner}",
						{ account: accountId, eid: tx.externalId, owner: ownerId }
					);
					isDuplicate = true;
				} catch (err) { /* not found */ }
			} else {
				var txDesc = normalizeDescription(tx.description);
				var txValue = tx.value || 0;
				var txRange = pbDateRange(tx.date);
				try {
					var candidates = $app.findRecordsByFilter(
						"transactions",
						"account = {:account} && date >= {:start} && date < {:end} && value = {:value} && owner = {:owner}",
						"",
						0,
						0,
						{ account: accountId, start: txRange.start, end: txRange.end, value: txValue, owner: ownerId }
					);
					for (var m = 0; m < candidates.length; m++) {
						if (normalizeDescription(candidates[m].getString("description")) === txDesc) {
							isDuplicate = true;
							break;
						}
					}
				} catch (err) { /* not found */ }
			}

			if (isDuplicate) {
				result.transactions.skipped++;
				continue;
			}

			var labelIds = [];
			if (tx.labels) {
				for (var l = 0; l < tx.labels.length; l++) {
					var lblCacheKey = tx.labels[l] + "::" + ownerId;
					var lblId = cachedFindOrCreate(
						labelCache, lblCacheKey,
						"transactionLabels",
						"name = {:name} && owner = {:owner}",
						{ name: tx.labels[l], owner: ownerId },
						{ name: tx.labels[l], owner: ownerId }
					);
					labelIds.push(lblId);
				}
			}

			var tnow = new Date().toISOString();
			var txColl = $app.findCollectionByNameOrId("transactions");
			var txRec = new Record(txColl);
			txRec.set("account", accountId);
			txRec.set("date", tx.date);
			txRec.set("description", tx.description || "");
			txRec.set("value", tx.value || 0);
			txRec.set("externalId", tx.externalId || "");
			txRec.set("labels", labelIds);
			txRec.set("excluded", tx.excluded ? tnow : "");
			txRec.set("owner", ownerId);
			txRec.set("importSession", session.id);
			$app.save(txRec);
			result.transactions.created++;
		}
	}

	var totalCreated =
		result.accounts.created + result.assets.created + result.transactions.created +
		result.accountBalances.created + result.assetBalances.created;
	var totalSkipped =
		result.accounts.existing + result.assets.existing + result.transactions.skipped +
		result.accountBalances.skipped + result.assetBalances.skipped;

	session.set("status", "completed");
	session.set("recordsCreated", totalCreated);
	session.set("recordsSkipped", totalSkipped);
	$app.save(session);

	return e.json(200, result);
}, $apis.requireAuth());

routerAdd("POST", "/api/canutin/import/revert", function (e) {
	var COLLECTIONS = ["transactions", "accountBalances", "assetBalances", "accounts", "assets"];

	var info = e.requestInfo();
	var auth = info.auth;
	var body = info.body;

	if (!body.sessionId) throw new BadRequestError("sessionId is required");

	var session = $app.findRecordById("importSessions", body.sessionId);
	if (session.getString("owner") !== auth.id) throw new ForbiddenError("Unauthorized");
	if (session.getString("status") === "rolled_back") throw new BadRequestError("Session already reverted");

	var totalDeleted = 0;

	$app.runInTransaction(function (txApp) {
		for (var i = 0; i < COLLECTIONS.length; i++) {
			while (true) {
				var records;
				try {
					records = txApp.findRecordsByFilter(
						COLLECTIONS[i],
						"importSession = {:sid} && owner = {:owner}",
						"", 100, 0,
						{ sid: body.sessionId, owner: auth.id }
					);
				} catch (err) { break; }
				if (!records || records.length === 0) break;
				for (var j = 0; j < records.length; j++) {
					txApp.delete(records[j]);
					totalDeleted++;
				}
			}
		}

		var allLabels;
		try {
			allLabels = txApp.findRecordsByFilter(
				"transactionLabels",
				"owner = {:owner}", "", 0, 0,
				{ owner: auth.id }
			);
		} catch (err) { allLabels = []; }

		for (var li = 0; li < allLabels.length; li++) {
			try {
				txApp.findFirstRecordByFilter(
					"transactions",
					"labels ~ {:labelId} && owner = {:owner}",
					{ labelId: allLabels[li].id, owner: auth.id }
				);
			} catch (err) {
				txApp.delete(allLabels[li]);
			}
		}

		var allBalanceTypes;
		try {
			allBalanceTypes = txApp.findRecordsByFilter(
				"balanceTypes",
				"owner = {:owner}", "", 0, 0,
				{ owner: auth.id }
			);
		} catch (err) { allBalanceTypes = []; }

		for (var bi = 0; bi < allBalanceTypes.length; bi++) {
			var btId = allBalanceTypes[bi].id;
			var inUse = false;
			try {
				txApp.findFirstRecordByFilter("accounts", "balanceType = {:btId} && owner = {:owner}", { btId: btId, owner: auth.id });
				inUse = true;
			} catch (err) { /* not found */ }
			if (!inUse) {
				try {
					txApp.findFirstRecordByFilter("assets", "balanceType = {:btId} && owner = {:owner}", { btId: btId, owner: auth.id });
					inUse = true;
				} catch (err) { /* not found */ }
			}
			if (!inUse) {
				txApp.delete(allBalanceTypes[bi]);
			}
		}

		session.set("status", "rolled_back");
		session.set("recordsCreated", 0);
		session.set("recordsSkipped", 0);
		txApp.save(session);
	});

	return e.json(200, { sessionId: body.sessionId, deleted: totalDeleted });
}, $apis.requireAuth());
