import { adminLogin, resetDatabase } from './pocketbase.helpers';

export default async function globalSetup() {
	await adminLogin();
	await resetDatabase();
}
