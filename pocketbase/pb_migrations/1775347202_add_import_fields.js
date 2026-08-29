/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const importSessionField = {
    "cascadeDelete": false,
    "collectionId": "pbc_3847291056",
    "hidden": false,
    "id": "relation4738291001",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "importSession",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  };

  // Add importSession to transactions
  const transactions = app.findCollectionByNameOrId("pbc_3174063690");
  transactions.fields.add(new Field(importSessionField));
  transactions.fields.add(new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text4738291002",
    "max": 0,
    "min": 0,
    "name": "externalId",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }));
  app.save(transactions);

  // Add importSession to accounts
  const accounts = app.findCollectionByNameOrId("pbc_2324088501");
  accounts.fields.add(new Field(importSessionField));
  app.save(accounts);

  // Add importSession to accountBalances
  const accountBalances = app.findCollectionByNameOrId("pbc_1811848958");
  accountBalances.fields.add(new Field(importSessionField));
  app.save(accountBalances);

  // Add importSession to assets
  const assets = app.findCollectionByNameOrId("pbc_1321337024");
  assets.fields.add(new Field(importSessionField));
  app.save(assets);

  // Add importSession to assetBalances
  const assetBalances = app.findCollectionByNameOrId("pbc_1178802947");
  assetBalances.fields.add(new Field(importSessionField));
  app.save(assetBalances);
}, (app) => {
  const fieldId = "relation4738291001";
  const externalIdFieldId = "text4738291002";

  const transactions = app.findCollectionByNameOrId("pbc_3174063690");
  transactions.fields.removeById(fieldId);
  transactions.fields.removeById(externalIdFieldId);
  app.save(transactions);

  const accounts = app.findCollectionByNameOrId("pbc_2324088501");
  accounts.fields.removeById(fieldId);
  app.save(accounts);

  const accountBalances = app.findCollectionByNameOrId("pbc_1811848958");
  accountBalances.fields.removeById(fieldId);
  app.save(accountBalances);

  const assets = app.findCollectionByNameOrId("pbc_1321337024");
  assets.fields.removeById(fieldId);
  app.save(assets);

  const assetBalances = app.findCollectionByNameOrId("pbc_1178802947");
  assetBalances.fields.removeById(fieldId);
  app.save(assetBalances);
})
