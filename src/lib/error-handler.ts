/**
 * Error codes for user-facing error messages.
 */
export enum ErrorCode {
	CONNECTION_ERROR = 'CONNECTION_ERROR',
	SUBSCRIPTION_ERROR = 'SUBSCRIPTION_ERROR'
}

/**
 * Centralized error handler for the application.
 * Designed to be Sentry-ready - when we integrate Sentry later,
 * we just need to add Sentry.captureException() to the capture() method.
 */
export class ErrorHandler {
	/**
	 * Capture and log an error with context metadata.
	 * Future: This will send errors to Sentry with proper tags.
	 */
	static capture(error: unknown, context: string, operation: string): void {
		console.error(`[${context}:${operation}]`, error);
		// Future Sentry integration point:
		// Sentry.captureException(error, {
		//   tags: { context, operation }
		// });
	}

	/**
	 * Extract an error type or message from an error object.
	 * For database operations, any error is treated as a connection error.
	 */
	static getUserMessage(error: unknown, fallback: string): ErrorCode | string {
		// For any error during fetch operations, treat as connection error
		// This covers all browsers and error types without string matching
		if (error instanceof Error) {
			return ErrorCode.CONNECTION_ERROR;
		}
		if (typeof error === 'string') {
			return error;
		}
		return fallback;
	}
}
