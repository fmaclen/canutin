function format(context: string, operation: string) {
	return `[${context}:${operation}]`;
}

export function logError(context: string, operation: string, error: unknown) {
	console.error(format(context, operation), error);
}
