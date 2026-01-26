import { adjectives, animals, uniqueNamesGenerator } from 'unique-names-generator';

export function generateDemoEmail(): string {
	const name = uniqueNamesGenerator({
		dictionaries: [adjectives, animals],
		separator: '-',
		length: 2
	});
	return `${name}@example.com`;
}
