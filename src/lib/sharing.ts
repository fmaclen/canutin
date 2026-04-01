import type {
	AccountSharesPerspectiveOptions,
	AssetSharesPerspectiveOptions
} from './pocketbase.schema';

export function projectSignedValue(
	value: number | null | undefined,
	perspective: AccountSharesPerspectiveOptions | AssetSharesPerspectiveOptions
) {
	const normalized = value ?? 0;
	return perspective === 'INVERSE' ? -normalized : normalized;
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
	const projectedBookValue = projectSignedValue(bookValue, perspective);
	const projectedMarketValue = projectSignedValue(marketValue, perspective);
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
