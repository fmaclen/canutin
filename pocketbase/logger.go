package main

import "log"

// logEvent records an operational diagnostic with a stable bracket tag so PocketBase's Logs API can
// filter by module. The operation string must describe only operational context — record ids,
// collection names, dates, or generic failure classes — and never user-supplied finance metadata
// (names, labels, symbols, descriptions, notes). Pass a nil err for lifecycle notices.
func logEvent(tag, operation string, err error) {
	if err != nil {
		log.Printf("[%s] %s: %v", tag, operation, err)
		return
	}
	log.Printf("[%s] %s", tag, operation)
}
