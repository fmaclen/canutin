/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2175204147")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX idx_securityTransactions_importSession ON securityTransactions (importSession, owner)",
      "CREATE INDEX idx_securityTransactions_lookup ON securityTransactions (account, security, date)",
      "CREATE INDEX idx_securityTransactions_account_date ON securityTransactions (account, date)",
      "CREATE UNIQUE INDEX idx_securityTransactions_externalId ON securityTransactions (account, externalId, security, owner) WHERE externalId != ''"
    ]
  }, collection)

  // add field
  collection.fields.addAt(17, new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text2809179246",
    "max": 0,
    "min": 0,
    "name": "externalId",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2175204147")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX idx_securityTransactions_importSession ON securityTransactions (importSession, owner)",
      "CREATE INDEX idx_securityTransactions_lookup ON securityTransactions (account, security, date)",
      "CREATE INDEX idx_securityTransactions_account_date ON securityTransactions (account, date)"
    ]
  }, collection)

  // remove field
  collection.fields.removeById("text2809179246")

  return app.save(collection)
})
