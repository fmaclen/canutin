/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  for (const collection of ["accounts", "assets", "securities"]) {
    app.db().newQuery(`
      UPDATE [[${collection}]]
      SET [[currency]] = 'USD'
      WHERE [[currency]] IS NULL OR trim([[currency]]) = ''
    `).execute();
  }

  const currencies = app.findCollectionByNameOrId("currencies");
  const users = app.findAllRecords("users");
  for (const user of users) {
    const existing = app.findRecordsByFilter(
      currencies,
      "owner = {:owner} && code = 'USD'",
      "",
      1,
      0,
      { owner: user.id },
    );
    if (existing.length !== 0) {
      continue;
    }

    const currency = new Record(currencies);
    currency.set("owner", user.id);
    currency.set("code", "USD");
    currency.set("name", "US Dollar");
    currency.set("autoUpdate", false);
    app.save(currency);
  }
}, () => {})
