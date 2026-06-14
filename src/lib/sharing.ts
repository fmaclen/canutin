import type {
	AccountSharesPerspectiveOptions,
	AssetSharesPerspectiveOptions
} from './pocketbase.schema';

export function projectSignedValue(
	value: number,
	perspective: AccountSharesPerspectiveOptions | AssetSharesPerspectiveOptions
): number;
export function projectSignedValue(
	value: number | null | undefined,
	perspective: AccountSharesPerspectiveOptions | AssetSharesPerspectiveOptions
): number | null;
export function projectSignedValue(
	value: number | null | undefined,
	perspective: AccountSharesPerspectiveOptions | AssetSharesPerspectiveOptions
): number | null {
	if (value === null || value === undefined) return null;
	return perspective === 'INVERSE' ? -value : value;
}

export function participantExcluded(
	isOwner: boolean,
	ownerExcluded: boolean,
	includeInNetWorth: boolean | null | undefined
) {
	if (isOwner) return ownerExcluded;
	return includeInNetWorth === false;
}

export function projectAssetFinancials(
	bookValue: number | null | undefined,
	marketValue: number | null | undefined,
	perspective: AssetSharesPerspectiveOptions
) {
	const projectedBookValue = projectSignedValue(bookValue ?? 0, perspective);
	const projectedMarketValue = projectSignedValue(marketValue ?? 0, perspective);
	const gain = projectedMarketValue - projectedBookValue;

	let gainPercent = 0;
	const rawBookValue = bookValue ?? 0;
	if (rawBookValue !== 0) {
		const rawGain = (marketValue ?? 0) - rawBookValue;
		gainPercent = (rawGain / Math.abs(rawBookValue)) * 100;
		if (perspective === 'INVERSE') gainPercent = -gainPercent;
	}

	return {
		bookValue: projectedBookValue,
		marketValue: projectedMarketValue,
		gain,
		gainPercent
	};
}
