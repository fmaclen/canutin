import { resetDatabase, seedDemoAccount } from './pocketbase.helpers';

export default async function globalSetup() {
	await resetDatabase();
	await seedDemoAccount();
}
