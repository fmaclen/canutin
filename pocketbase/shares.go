package main

import (
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

type createShareBody struct {
	AccountID      string `json:"accountId" form:"accountId"`
	AssetID        string `json:"assetId" form:"assetId"`
	RecipientEmail string `json:"recipientEmail" form:"recipientEmail"`
	Perspective    string `json:"perspective" form:"perspective"`
}

func createAccountShareHandler(app core.App) func(*core.RequestEvent) error {
	return func(re *core.RequestEvent) error {
		var body createShareBody
		if err := re.BindBody(&body); err != nil {
			return re.BadRequestError("Invalid request body", err)
		}

		return createShare(
			re,
			app,
			"accountShares",
			"accounts",
			"account",
			body.AccountID,
			body.RecipientEmail,
			body.Perspective,
		)
	}
}

func createAssetShareHandler(app core.App) func(*core.RequestEvent) error {
	return func(re *core.RequestEvent) error {
		var body createShareBody
		if err := re.BindBody(&body); err != nil {
			return re.BadRequestError("Invalid request body", err)
		}

		return createShare(
			re,
			app,
			"assetShares",
			"assets",
			"asset",
			body.AssetID,
			body.RecipientEmail,
			body.Perspective,
		)
	}
}

func createShare(
	re *core.RequestEvent,
	app core.App,
	shareCollectionName string,
	parentCollectionName string,
	parentFieldName string,
	parentID string,
	recipientEmail string,
	perspective string,
) error {
	if re.Auth == nil {
		return re.ForbiddenError("Authentication required", nil)
	}

	trimmedParentID := strings.TrimSpace(parentID)
	if trimmedParentID == "" {
		return re.BadRequestError("Missing record id", nil)
	}

	normalizedEmail := strings.TrimSpace(strings.ToLower(recipientEmail))
	if normalizedEmail == "" {
		return re.BadRequestError("Recipient email is required", nil)
	}

	normalizedPerspective := strings.ToUpper(strings.TrimSpace(perspective))
	if normalizedPerspective != "NORMAL" && normalizedPerspective != "INVERSE" {
		return re.BadRequestError("Perspective must be NORMAL or INVERSE", nil)
	}

	parent, err := app.FindRecordById(parentCollectionName, trimmedParentID)
	if err != nil {
		return re.NotFoundError("Shared record not found", err)
	}
	if parent.GetString("owner") != re.Auth.Id {
		return re.ForbiddenError("Only the owner can share this record", nil)
	}

	recipient, err := app.FindAuthRecordByEmail("users", normalizedEmail)
	if err != nil {
		return re.NotFoundError("Recipient user not found", err)
	}
	if recipient.Id == re.Auth.Id {
		return re.BadRequestError("You cannot share a record with yourself", nil)
	}

	existingShares, err := app.FindRecordsByFilter(
		shareCollectionName,
		parentFieldName+" = {:parent} && recipient = {:recipient}",
		"",
		1,
		0,
		map[string]any{
			"parent":    trimmedParentID,
			"recipient": recipient.Id,
		},
	)
	if err == nil && len(existingShares) > 0 {
		return re.BadRequestError("This record is already shared with that user", nil)
	}

	collection, err := app.FindCollectionByNameOrId(shareCollectionName)
	if err != nil {
		return re.InternalServerError("Share collection not found", err)
	}

	share := core.NewRecord(collection)
	share.Set(parentFieldName, trimmedParentID)
	share.Set("recipient", recipient.Id)
	share.Set("recipientEmail", recipient.Email())
	share.Set("grantedBy", re.Auth.Id)
	share.Set("accessRole", "VIEWER")
	share.Set("perspective", normalizedPerspective)
	share.Set("includeInNetWorth", true)

	if err := app.Save(share); err != nil {
		return re.BadRequestError("Failed to create share", err)
	}

	return re.JSON(200, map[string]any{
		"id": share.Id,
	})
}

func validateShareUpdateRequest(e *core.RecordRequestEvent) error {
	if e.Auth == nil {
		return e.ForbiddenError("Authentication required", nil)
	}

	info, err := e.RequestInfo()
	if err != nil {
		return e.BadRequestError("Invalid request body", err)
	}

	grantedBy := e.Record.GetString("grantedBy")
	if e.Auth.Id == grantedBy {
		return e.ForbiddenError("Sharers must revoke and recreate shares to change them", nil)
	}

	recipient := e.Record.GetString("recipient")
	if e.Auth.Id != recipient {
		return e.ForbiddenError("You cannot update this share", nil)
	}

	for key := range info.Body {
		if key != "includeInNetWorth" {
			return e.ForbiddenError("Recipients can only update includeInNetWorth", nil)
		}
	}

	return nil
}
