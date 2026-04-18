/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const accountShares = app.findCollectionByNameOrId("pbc_3262151894");
  accountShares.updateRule = "recipient = @request.auth.id";
  app.save(accountShares);

  const assetShares = app.findCollectionByNameOrId("pbc_2019661285");
  assetShares.updateRule = "recipient = @request.auth.id";
  return app.save(assetShares);
}, (app) => {
  const accountShares = app.findCollectionByNameOrId("pbc_3262151894");
  accountShares.updateRule = "grantedBy = @request.auth.id || recipient = @request.auth.id";
  app.save(accountShares);

  const assetShares = app.findCollectionByNameOrId("pbc_2019661285");
  assetShares.updateRule = "grantedBy = @request.auth.id || recipient = @request.auth.id";
  return app.save(assetShares);
})
