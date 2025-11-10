import { resetDatabase } from './pocketbase.helpers';

export default async function globalSetup() {
	await resetDatabase();
}
