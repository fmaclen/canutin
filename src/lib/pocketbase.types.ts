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
	Accounts = "accounts",
	AssetBalances = "assetBalances",
	Assets = "assets",
	BalanceTypes = "balanceTypes",
	TransactionLabels = "transactionLabels",
	Transactions = "transactions",
	Users = "users",
}

// Alias types for improved usability
export type IsoDateString = string
export type RecordIdString = string
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
	created?: IsoDateString
	fingerprint: string
	id: string
	recordRef: string
	updated?: IsoDateString
}

export type ExternalauthsRecord = {
	collectionRef: string
	created?: IsoDateString
	id: string
	provider: string
	providerId: string
	recordRef: string
	updated?: IsoDateString
}

export type MfasRecord = {
	collectionRef: string
	created?: IsoDateString
	id: string
	method: string
	recordRef: string
	updated?: IsoDateString
}

export type OtpsRecord = {
	collectionRef: string
	created?: IsoDateString
	id: string
	password: string
	recordRef: string
	sentTo?: string
	updated?: IsoDateString
}

export type SuperusersRecord = {
	created?: IsoDateString
	email: string
	emailVisibility?: boolean
	id: string
	password: string
	tokenKey: string
	updated?: IsoDateString
	verified?: boolean
}

export type AccountBalancesRecord = {
	created?: IsoDateString
	id: string
	updated?: IsoDateString
	value?: number
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
	balanceType?: RecordIdString
	balances?: RecordIdString[]
	closed?: IsoDateString
	created?: IsoDateString
	excluded?: IsoDateString
	id: string
	institution?: string
	name: string
	transactions?: RecordIdString[]
	updated?: IsoDateString
}

export type AssetBalancesRecord = {
	cost?: number
	created?: IsoDateString
	id: string
	quantity?: number
	updated?: IsoDateString
	value?: number
}

export enum AssetsBalanceGroupOptions {
	"CASH" = "CASH",
	"DEBT" = "DEBT",
	"INVESTMENT" = "INVESTMENT",
	"OTHER" = "OTHER",
}
export type AssetsRecord = {
	balanceGroup: AssetsBalanceGroupOptions
	balanceType?: RecordIdString
	balances?: RecordIdString[]
	created?: IsoDateString
	excluded?: IsoDateString
	id: string
	name: string
	sold?: IsoDateString
	symbol?: string
	updated?: IsoDateString
}

export type BalanceTypesRecord = {
	created?: IsoDateString
	id: string
	name?: string
	updated?: IsoDateString
}

export type TransactionLabelsRecord = {
	created?: IsoDateString
	id: string
	name: string
	updated?: IsoDateString
}

export type TransactionsRecord = {
	created?: IsoDateString
	date?: IsoDateString
	description?: string
	excluded?: IsoDateString
	id: string
	labels?: RecordIdString[]
	pending?: IsoDateString
	updated?: IsoDateString
	value?: number
}

export type UsersRecord = {
	avatar?: string
	created?: IsoDateString
	email: string
	emailVisibility?: boolean
	id: string
	name?: string
	password: string
	tokenKey: string
	updated?: IsoDateString
	verified?: boolean
}

// Response types include system fields and match responses from the PocketBase API
export type AuthoriginsResponse<Texpand = unknown> = Required<AuthoriginsRecord> & BaseSystemFields<Texpand>
export type ExternalauthsResponse<Texpand = unknown> = Required<ExternalauthsRecord> & BaseSystemFields<Texpand>
export type MfasResponse<Texpand = unknown> = Required<MfasRecord> & BaseSystemFields<Texpand>
export type OtpsResponse<Texpand = unknown> = Required<OtpsRecord> & BaseSystemFields<Texpand>
export type SuperusersResponse<Texpand = unknown> = Required<SuperusersRecord> & AuthSystemFields<Texpand>
export type AccountBalancesResponse<Texpand = unknown> = Required<AccountBalancesRecord> & BaseSystemFields<Texpand>
export type AccountsResponse<Texpand = unknown> = Required<AccountsRecord> & BaseSystemFields<Texpand>
export type AssetBalancesResponse<Texpand = unknown> = Required<AssetBalancesRecord> & BaseSystemFields<Texpand>
export type AssetsResponse<Texpand = unknown> = Required<AssetsRecord> & BaseSystemFields<Texpand>
export type BalanceTypesResponse<Texpand = unknown> = Required<BalanceTypesRecord> & BaseSystemFields<Texpand>
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
	accounts: AccountsRecord
	assetBalances: AssetBalancesRecord
	assets: AssetsRecord
	balanceTypes: BalanceTypesRecord
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
	accounts: AccountsResponse
	assetBalances: AssetBalancesResponse
	assets: AssetsResponse
	balanceTypes: BalanceTypesResponse
	transactionLabels: TransactionLabelsResponse
	transactions: TransactionsResponse
	users: UsersResponse
}

// Type for usage with type asserted PocketBase instance
// https://github.com/pocketbase/js-sdk#specify-typescript-definitions

export type TypedPocketBase = PocketBase & {
	collection(idOrName: '_authOrigins'): RecordService<AuthoriginsResponse>
	collection(idOrName: '_externalAuths'): RecordService<ExternalauthsResponse>
	collection(idOrName: '_mfas'): RecordService<MfasResponse>
	collection(idOrName: '_otps'): RecordService<OtpsResponse>
	collection(idOrName: '_superusers'): RecordService<SuperusersResponse>
	collection(idOrName: 'accountBalances'): RecordService<AccountBalancesResponse>
	collection(idOrName: 'accounts'): RecordService<AccountsResponse>
	collection(idOrName: 'assetBalances'): RecordService<AssetBalancesResponse>
	collection(idOrName: 'assets'): RecordService<AssetsResponse>
	collection(idOrName: 'balanceTypes'): RecordService<BalanceTypesResponse>
	collection(idOrName: 'transactionLabels'): RecordService<TransactionLabelsResponse>
	collection(idOrName: 'transactions'): RecordService<TransactionsResponse>
	collection(idOrName: 'users'): RecordService<UsersResponse>
}
