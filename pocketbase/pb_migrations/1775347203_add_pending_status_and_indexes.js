/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const sessions = app.findCollectionByNameOrId("pbc_3847291056");
  const statusField = sessions.fields.getById("select3847291003");
  statusField.values = ["pending", "completed", "rolled_back"];
  app.save(sessions);

  const transactions = app.findCollectionByNameOrId("pbc_3174063690");
  transactions.indexes = transactions.indexes || [];
  transactions.indexes.push("CREATE INDEX idx_transactions_importSession ON transactions (importSession, owner)");
  transactions.indexes.push("CREATE INDEX idx_transactions_externalId ON transactions (account, externalId, owner) WHERE externalId != ''");
  app.save(transactions);

  const accountBalances = app.findCollectionByNameOrId("pbc_1811848958");
  accountBalances.indexes = accountBalances.indexes || [];
  accountBalances.indexes.push("CREATE INDEX idx_accountBalances_importSession ON accountBalances (importSession, owner)");
  app.save(accountBalances);

  const accounts = app.findCollectionByNameOrId("pbc_2324088501");
  accounts.indexes = accounts.indexes || [];
  accounts.indexes.push("CREATE INDEX idx_accounts_importSession ON accounts (importSession, owner)");
  app.save(accounts);

  const assetBalances = app.findCollectionByNameOrId("pbc_1178802947");
  assetBalances.indexes = assetBalances.indexes || [];
  assetBalances.indexes.push("CREATE INDEX idx_assetBalances_importSession ON assetBalances (importSession, owner)");
  app.save(assetBalances);

  const assets = app.findCollectionByNameOrId("pbc_1321337024");
  assets.indexes = assets.indexes || [];
  assets.indexes.push("CREATE INDEX idx_assets_importSession ON assets (importSession, owner)");
  app.save(assets);
}, (app) => {
  const sessions = app.findCollectionByNameOrId("pbc_3847291056");
  const statusField = sessions.fields.getById("select3847291003");
  statusField.values = ["completed", "rolled_back"];
  app.save(sessions);
})
