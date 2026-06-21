function format(context: string, operation: string) {
	return `[${context}:${operation}]`;
}

export function logError(context: string, operation: string, error: unknown) {
	console.error(format(context, operation), error);
}

export function logWarn(context: string, operation: string, error: unknown) {
	console.warn(format(context, operation), error);
}
