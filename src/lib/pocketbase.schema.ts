/**
* This file was @generated using pocketbase-typegen
*/

import type PocketBase from 'pocketbase'
import type { RecordService } from 'pocketbase'

export enum Collections {
	Authorigins = "_authOrigins",
	Externalauths = "_externalAuths",
	Mfas = "_mfas",
	Otps = "_otps",
	Superusers = "_superusers",
	AccountBalances = "accountBalances",
	AccountShares = "accountShares",
	Accounts = "accounts",
	AssetBalances = "assetBalances",
	AssetShares = "assetShares",
	Assets = "assets",
	BalanceTypes = "balanceTypes",
	ImportSessions = "importSessions",
	Securities = "securities",
	SecurityBalances = "securityBalances",
	SecurityTransactions = "securityTransactions",
	TransactionLabels = "transactionLabels",
	Transactions = "transactions",
	Users = "users",
}

// Alias types for improved usability
export type IsoDateString = string
export type IsoAutoDateString = string & { readonly autodate: unique symbol }
export type RecordIdString = string
export type FileNameString = string & { readonly filename: unique symbol }
export type HTMLString = string

type ExpandType<T> = unknown extends T
	? T extends unknown
		? { expand?: unknown }
		: { expand: T }
	: { expand: T }

// System fields
export type BaseSystemFields<T = unknown> = {
	id: RecordIdString
	collectionId: string
	collectionName: Collections
} & ExpandType<T>

export type AuthSystemFields<T = unknown> = {
	email: string
	emailVisibility: boolean
	username: string
	verified: boolean
} & BaseSystemFields<T>

// Record types for each collection

export type AuthoriginsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	fingerprint: string
	id: string
	recordRef: string
	updated: IsoAutoDateString
}

export type ExternalauthsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	provider: string
	providerId: string
	recordRef: string
	updated: IsoAutoDateString
}

export type MfasRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	method: string
	recordRef: string
	updated: IsoAutoDateString
}

export type OtpsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	password: string
	recordRef: string
	sentTo?: string
	updated: IsoAutoDateString
}

export type SuperusersRecord = {
	created: IsoAutoDateString
	email: string
	emailVisibility?: boolean
	id: string
	password: string
	tokenKey: string
	updated: IsoAutoDateString
	verified?: boolean
}

export type AccountBalancesRecord = {
	account: RecordIdString
	asOf: IsoDateString
	created: IsoAutoDateString
	id: string
	importSession?: RecordIdString
	owner: RecordIdString
	updated: IsoAutoDateString
	value?: number
}

export enum AccountSharesAccessRoleOptions {
	"VIEWER" = "VIEWER",
}

export enum AccountSharesPerspectiveOptions {
	"NORMAL" = "NORMAL",
	"INVERSE" = "INVERSE",
}
export type AccountSharesRecord = {
	accessRole: AccountSharesAccessRoleOptions
	account: RecordIdString
	grantedBy: RecordIdString
	id: string
	includeInNetWorth?: boolean
	perspective: AccountSharesPerspectiveOptions
	recipient: RecordIdString
	recipientEmail: string
}

export enum AccountsBalanceGroupOptions {
	"CASH" = "CASH",
	"DEBT" = "DEBT",
	"INVESTMENT" = "INVESTMENT",
	"OTHER" = "OTHER",
}
export type AccountsRecord = {
	autoCalculated?: IsoDateString
	balanceGroup: AccountsBalanceGroupOptions
	balanceType: RecordIdString
	closed?: IsoDateString
	created: IsoAutoDateString
	excluded?: IsoDateString
	id: string
	importSession?: RecordIdString
	institution?: string
	name: string
	notes?: string
	owner: RecordIdString
	updated: IsoAutoDateString
}

export type AssetBalancesRecord = {
	asOf: IsoDateString
	asset: RecordIdString
	bookValue?: number
	created: IsoAutoDateString
	id: string
	importSession?: RecordIdString
	marketValue?: number
	owner: RecordIdString
	updated: IsoAutoDateString
}

export enum AssetSharesAccessRoleOptions {
	"VIEWER" = "VIEWER",
}

export enum AssetSharesPerspectiveOptions {
	"NORMAL" = "NORMAL",
	"INVERSE" = "INVERSE",
}
export type AssetSharesRecord = {
	accessRole: AssetSharesAccessRoleOptions
	asset: RecordIdString
	grantedBy: RecordIdString
	id: string
	includeInNetWorth?: boolean
	perspective: AssetSharesPerspectiveOptions
	recipient: RecordIdString
	recipientEmail: string
}

export enum AssetsBalanceGroupOptions {
	"CASH" = "CASH",
	"DEBT" = "DEBT",
	"INVESTMENT" = "INVESTMENT",
	"OTHER" = "OTHER",
}
export type AssetsRecord = {
	balanceGroup: AssetsBalanceGroupOptions
	balanceType: RecordIdString
	created: IsoAutoDateString
	excluded?: IsoDateString
	id: string
	importSession?: RecordIdString
	name: string
	notes?: string
	owner: RecordIdString
	sold?: IsoDateString
	updated: IsoAutoDateString
}

export type BalanceTypesRecord = {
	created: IsoAutoDateString
	id: string
	name: string
	owner: RecordIdString
	updated: IsoAutoDateString
}

export enum ImportSessionsStatusOptions {
	"pending" = "pending",
	"completed" = "completed",
	"rolled_back" = "rolled_back",
}
export type ImportSessionsRecord = {
	created: IsoAutoDateString
	id: string
	label: string
	owner: RecordIdString
	recordsCreated?: number
	recordsSkipped?: number
	status: ImportSessionsStatusOptions
	updated: IsoAutoDateString
}

export type SecuritiesRecord = {
	created: IsoAutoDateString
	id: string
	importSession?: RecordIdString
	name: string
	normalizedName?: string
	owner: RecordIdString
	symbol?: string
	updated: IsoAutoDateString
}

export type SecurityBalancesRecord<TcostBasis = unknown, Tprice = unknown, Tquantity = unknown, Tvalue = unknown> = {
	account: RecordIdString
	asOf: IsoDateString
	costBasis?: null | TcostBasis
	created: IsoAutoDateString
	id: string
	importSession?: RecordIdString
	owner: RecordIdString
	price?: null | Tprice
	quantity?: null | Tquantity
	security: RecordIdString
	updated: IsoAutoDateString
	value?: null | Tvalue
}

export enum SecurityTransactionsTypeOptions {
	"buy" = "buy",
	"sell" = "sell",
	"cancel" = "cancel",
	"cash" = "cash",
	"fee" = "fee",
	"transfer" = "transfer",
}
export type SecurityTransactionsRecord<Tamount = unknown, Tfees = unknown, Tprice = unknown, Tquantity = unknown> = {
	account: RecordIdString
	amount?: null | Tamount
	created: IsoAutoDateString
	date: IsoDateString
	description: string
	fees?: null | Tfees
	id: string
	importSession?: RecordIdString
	name?: string
	notes?: string
	owner: RecordIdString
	price?: null | Tprice
	quantity?: null | Tquantity
	security: RecordIdString
	subtype?: string
	type: SecurityTransactionsTypeOptions
	updated: IsoAutoDateString
}

export type TransactionLabelsRecord = {
	created: IsoAutoDateString
	id: string
	name: string
	owner: RecordIdString
	updated: IsoAutoDateString
}

export type TransactionsRecord = {
	account: RecordIdString
	created: IsoAutoDateString
	date: IsoDateString
	description?: string
	excluded?: IsoDateString
	externalId?: string
	id: string
	importSession?: RecordIdString
	labels?: RecordIdString[]
	notes?: string
	owner: RecordIdString
	updated: IsoAutoDateString
	value?: number
}

export type UsersRecord = {
	avatar?: FileNameString
	created: IsoAutoDateString
	email: string
	emailVisibility?: boolean
	id: string
	name?: string
	password: string
	tokenKey: string
	updated: IsoAutoDateString
	verified?: boolean
}

// Response types include system fields and match responses from the PocketBase API
export type AuthoriginsResponse<Texpand = unknown> = Required<AuthoriginsRecord> & BaseSystemFields<Texpand>
export type ExternalauthsResponse<Texpand = unknown> = Required<ExternalauthsRecord> & BaseSystemFields<Texpand>
export type MfasResponse<Texpand = unknown> = Required<MfasRecord> & BaseSystemFields<Texpand>
export type OtpsResponse<Texpand = unknown> = Required<OtpsRecord> & BaseSystemFields<Texpand>
export type SuperusersResponse<Texpand = unknown> = Required<SuperusersRecord> & AuthSystemFields<Texpand>
export type AccountBalancesResponse<Texpand = unknown> = Required<AccountBalancesRecord> & BaseSystemFields<Texpand>
export type AccountSharesResponse<Texpand = unknown> = Required<AccountSharesRecord> & BaseSystemFields<Texpand>
export type AccountsResponse<Texpand = unknown> = Required<AccountsRecord> & BaseSystemFields<Texpand>
export type AssetBalancesResponse<Texpand = unknown> = Required<AssetBalancesRecord> & BaseSystemFields<Texpand>
export type AssetSharesResponse<Texpand = unknown> = Required<AssetSharesRecord> & BaseSystemFields<Texpand>
export type AssetsResponse<Texpand = unknown> = Required<AssetsRecord> & BaseSystemFields<Texpand>
export type BalanceTypesResponse<Texpand = unknown> = Required<BalanceTypesRecord> & BaseSystemFields<Texpand>
export type ImportSessionsResponse<Texpand = unknown> = Required<ImportSessionsRecord> & BaseSystemFields<Texpand>
export type SecuritiesResponse<Texpand = unknown> = Required<SecuritiesRecord> & BaseSystemFields<Texpand>
export type SecurityBalancesResponse<TcostBasis = unknown, Tprice = unknown, Tquantity = unknown, Tvalue = unknown, Texpand = unknown> = Required<SecurityBalancesRecord<TcostBasis, Tprice, Tquantity, Tvalue>> & BaseSystemFields<Texpand>
export type SecurityTransactionsResponse<Tamount = unknown, Tfees = unknown, Tprice = unknown, Tquantity = unknown, Texpand = unknown> = Required<SecurityTransactionsRecord<Tamount, Tfees, Tprice, Tquantity>> & BaseSystemFields<Texpand>
export type TransactionLabelsResponse<Texpand = unknown> = Required<TransactionLabelsRecord> & BaseSystemFields<Texpand>
export type TransactionsResponse<Texpand = unknown> = Required<TransactionsRecord> & BaseSystemFields<Texpand>
export type UsersResponse<Texpand = unknown> = Required<UsersRecord> & AuthSystemFields<Texpand>

// Types containing all Records and Responses, useful for creating typing helper functions

export type CollectionRecords = {
	_authOrigins: AuthoriginsRecord
	_externalAuths: ExternalauthsRecord
	_mfas: MfasRecord
	_otps: OtpsRecord
	_superusers: SuperusersRecord
	accountBalances: AccountBalancesRecord
	accountShares: AccountSharesRecord
	accounts: AccountsRecord
	assetBalances: AssetBalancesRecord
	assetShares: AssetSharesRecord
	assets: AssetsRecord
	balanceTypes: BalanceTypesRecord
	importSessions: ImportSessionsRecord
	securities: SecuritiesRecord
	securityBalances: SecurityBalancesRecord
	securityTransactions: SecurityTransactionsRecord
	transactionLabels: TransactionLabelsRecord
	transactions: TransactionsRecord
	users: UsersRecord
}

export type CollectionResponses = {
	_authOrigins: AuthoriginsResponse
	_externalAuths: ExternalauthsResponse
	_mfas: MfasResponse
	_otps: OtpsResponse
	_superusers: SuperusersResponse
	accountBalances: AccountBalancesResponse
	accountShares: AccountSharesResponse
	accounts: AccountsResponse
	assetBalances: AssetBalancesResponse
	assetShares: AssetSharesResponse
	assets: AssetsResponse
	balanceTypes: BalanceTypesResponse
	importSessions: ImportSessionsResponse
	securities: SecuritiesResponse
	securityBalances: SecurityBalancesResponse
	securityTransactions: SecurityTransactionsResponse
	transactionLabels: TransactionLabelsResponse
	transactions: TransactionsResponse
	users: UsersResponse
}

// Utility types for create/update operations

type ProcessCreateAndUpdateFields<T> = Omit<{
	// Omit AutoDate fields
	[K in keyof T as Extract<T[K], IsoAutoDateString> extends never ? K : never]: 
		// Convert FileNameString to File
		T[K] extends infer U ? 
			U extends (FileNameString | FileNameString[]) ? 
				U extends any[] ? File[] : File 
			: U
		: never
}, 'id'>

// Create type for Auth collections
export type CreateAuth<T> = {
	id?: RecordIdString
	email: string
	emailVisibility?: boolean
	password: string
	passwordConfirm: string
	verified?: boolean
} & ProcessCreateAndUpdateFields<T>

// Create type for Base collections
export type CreateBase<T> = {
	id?: RecordIdString
} & ProcessCreateAndUpdateFields<T>

// Update type for Auth collections
export type UpdateAuth<T> = Partial<
	Omit<ProcessCreateAndUpdateFields<T>, keyof AuthSystemFields>
> & {
	email?: string
	emailVisibility?: boolean
	oldPassword?: string
	password?: string
	passwordConfirm?: string
	verified?: boolean
}

// Update type for Base collections
export type UpdateBase<T> = Partial<
	Omit<ProcessCreateAndUpdateFields<T>, keyof BaseSystemFields>
>

// Get the correct create type for any collection
export type Create<T extends keyof CollectionResponses> =
	CollectionResponses[T] extends AuthSystemFields
		? CreateAuth<CollectionRecords[T]>
		: CreateBase<CollectionRecords[T]>

// Get the correct update type for any collection
export type Update<T extends keyof CollectionResponses> =
	CollectionResponses[T] extends AuthSystemFields
		? UpdateAuth<CollectionRecords[T]>
		: UpdateBase<CollectionRecords[T]>

// Type for usage with type asserted PocketBase instance
// https://github.com/pocketbase/js-sdk#specify-typescript-definitions

export type TypedPocketBase = {
	collection<T extends keyof CollectionResponses>(
		idOrName: T
	): RecordService<CollectionResponses[T]>
} & PocketBase
