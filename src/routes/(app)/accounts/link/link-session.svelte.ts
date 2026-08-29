export type PlaidAccount = {
	plaidAccountId: string;
	name: string;
	mask: string;
	type: string;
	subtype: string;
	currency: string;
	balance: number;
};

// Handoff from the full-screen bank handshake to the matching form. It only lives in memory, so a
// direct visit or a reload of the match route finds it empty and is sent back to /accounts.
export const linkSession: {
	connectionId: string;
	institutionName: string;
	accounts: PlaidAccount[];
} = $state({ connectionId: '', institutionName: '', accounts: [] });
