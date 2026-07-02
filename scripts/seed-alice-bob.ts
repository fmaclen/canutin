import PocketBase from 'pocketbase';

import { PB_URL } from '../e2e/pocketbase.helpers';
import type { TypedPocketBase } from '../src/lib/pocketbase.schema';

const PASSWORD = '123qweasdzxc';

async function admin(): Promise<TypedPocketBase> {
	const pb = new PocketBase(PB_URL) as TypedPocketBase;
	await pb.collection('_superusers').authWithPassword('superadmin@example.com', PASSWORD);
	return pb;
}

async function reset(pb: TypedPocketBase) {
	try {
		await pb.collections.truncate('users');
	} catch {
		// PB may 400 during cascade truncation; ignore.
	}
}

async function createUser(pb: TypedPocketBase, email: string) {
	return pb.collection('users').create({
		email,
		password: PASSWORD,
		passwordConfirm: PASSWORD,
		emailVisibility: true
	});
}

async function getOrCreateBalanceType(pb: TypedPocketBase, name: string, owner: string) {
	try {
		return await pb
			.collection('balanceTypes')
			.getFirstListItem(`name='${name}' && owner='${owner}'`);
	} catch {
		return await pb.collection('balanceTypes').create({ name, owner });
	}
}

async function createAccount(
	pb: TypedPocketBase,
	input: {
		name: string;
		institution?: string;
		balanceGroup: 'CASH' | 'DEBT' | 'INVESTMENT' | 'OTHER';
		balanceType: string;
		owner: string;
	}
) {
	const bt = await getOrCreateBalanceType(pb, input.balanceType, input.owner);
	return pb.collection('accounts').create({ ...input, balanceType: bt.id });
}

function daysAgo(days: number) {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() - days);
	return d.toISOString();
}

async function seedBalance(pb: TypedPocketBase, account: string, owner: string, value: number) {
	return pb.collection('accountBalances').create({
		account,
		owner,
		asOf: daysAgo(0),
		value
	});
}

async function seedTxn(
	pb: TypedPocketBase,
	account: string,
	owner: string,
	days: number,
	description: string,
	value: number
) {
	return pb.collection('transactions').create({
		account,
		owner,
		date: daysAgo(days),
		description,
		value
	});
}

async function main() {
	const pb = await admin();
	console.log('Resetting database...');
	await reset(pb);

	console.log('Creating users...');
	const alice = await createUser(pb, 'alice@example.com');
	const bob = await createUser(pb, 'bob@example.com');

	// Alice's accounts
	console.log('Seeding Alice accounts and transactions...');
	const aliceChecking = await createAccount(pb, {
		name: 'Alice Chase Checking',
		institution: 'Chase',
		balanceGroup: 'CASH',
		balanceType: 'Checking',
		owner: alice.id
	});
	await seedBalance(pb, aliceChecking.id, alice.id, 8420.55);

	const aliceSavings = await createAccount(pb, {
		name: 'Alice Ally Savings',
		institution: 'Ally Bank',
		balanceGroup: 'CASH',
		balanceType: 'Savings',
		owner: alice.id
	});
	await seedBalance(pb, aliceSavings.id, alice.id, 24500);

	const aliceAmex = await createAccount(pb, {
		name: 'Alice Amex Gold',
		institution: 'American Express',
		balanceGroup: 'DEBT',
		balanceType: 'Credit Card',
		owner: alice.id
	});
	await seedBalance(pb, aliceAmex.id, alice.id, -1834.22);

	// Bob's accounts
	console.log('Seeding Bob accounts and transactions...');
	const bobChecking = await createAccount(pb, {
		name: 'Bob Wells Fargo Checking',
		institution: 'Wells Fargo',
		balanceGroup: 'CASH',
		balanceType: 'Checking',
		owner: bob.id
	});
	await seedBalance(pb, bobChecking.id, bob.id, 3210.87);

	const bobSoFi = await createAccount(pb, {
		name: 'Bob SoFi Savings',
		institution: 'SoFi',
		balanceGroup: 'CASH',
		balanceType: 'Savings',
		owner: bob.id
	});
	await seedBalance(pb, bobSoFi.id, bob.id, 12750);

	const bobVisa = await createAccount(pb, {
		name: 'Bob Chase Sapphire',
		institution: 'Chase',
		balanceGroup: 'DEBT',
		balanceType: 'Credit Card',
		owner: bob.id
	});
	await seedBalance(pb, bobVisa.id, bob.id, -942.1);

	// Shared joint accounts
	console.log('Seeding shared accounts...');
	const jointChecking = await createAccount(pb, {
		name: 'Joint Bank of America Checking',
		institution: 'Bank of America',
		balanceGroup: 'CASH',
		balanceType: 'Joint Checking',
		owner: alice.id
	});
	await seedBalance(pb, jointChecking.id, alice.id, 5620.44);

	const jointMortgage = await createAccount(pb, {
		name: 'Joint Mortgage',
		institution: 'Rocket Mortgage',
		balanceGroup: 'DEBT',
		balanceType: 'Mortgage',
		owner: bob.id
	});
	await seedBalance(pb, jointMortgage.id, bob.id, -312450);

	// Alice shares the joint checking with Bob (NORMAL perspective)
	await pb.collection('accountShares').create({
		account: jointChecking.id,
		recipient: bob.id,
		recipientEmail: bob.email,
		grantedBy: alice.id,
		accessRole: 'VIEWER',
		perspective: 'NORMAL',
		includeInNetWorth: true
	});

	// Bob shares the joint mortgage with Alice (NORMAL - both see it as debt)
	await pb.collection('accountShares').create({
		account: jointMortgage.id,
		recipient: alice.id,
		recipientEmail: alice.email,
		grantedBy: bob.id,
		accessRole: 'VIEWER',
		perspective: 'NORMAL',
		includeInNetWorth: true
	});

	// Alice also shares her Ally Savings with Bob (INVERSE - Bob views it as a liability since he owes her)
	await pb.collection('accountShares').create({
		account: aliceSavings.id,
		recipient: bob.id,
		recipientEmail: bob.email,
		grantedBy: alice.id,
		accessRole: 'VIEWER',
		perspective: 'INVERSE',
		includeInNetWorth: false
	});

	// Transactions - Alice personal
	console.log('Seeding transactions...');
	const aliceChecking_txns: Array<[number, string, number]> = [
		[1, 'Whole Foods Market', -87.42],
		[2, 'Starbucks', -6.75],
		[3, 'Shell Gas Station', -52.3],
		[4, 'Venmo - Rent split', -1450],
		[5, 'Acme Corp Payroll', 4320.1],
		[7, 'Trader Joes', -64.21],
		[9, 'CVS Pharmacy', -28.9],
		[11, 'AT&T Wireless', -85.0],
		[14, 'PG&E', -142.55],
		[18, 'Acme Corp Payroll', 4320.1],
		[21, 'Target', -112.4],
		[24, 'Uber', -18.55],
		[28, 'Costco', -234.88]
	];
	for (const [days, desc, value] of aliceChecking_txns) {
		await seedTxn(pb, aliceChecking.id, alice.id, days, desc, value);
	}

	const aliceAmex_txns: Array<[number, string, number]> = [
		[2, 'Amazon.com', -54.99],
		[3, 'Netflix', -15.49],
		[5, 'Delta Airlines', -412.6],
		[8, 'Hilton Hotels', -278.0],
		[12, 'Spotify', -10.99],
		[15, 'Apple Services', -2.99],
		[19, 'DoorDash', -31.87],
		[22, 'Nordstrom', -189.5],
		[26, 'Payment - Thank You', 600]
	];
	for (const [days, desc, value] of aliceAmex_txns) {
		await seedTxn(pb, aliceAmex.id, alice.id, days, desc, value);
	}

	// Transactions - Bob personal
	const bobChecking_txns: Array<[number, string, number]> = [
		[1, 'Blue Bottle Coffee', -5.5],
		[2, 'Safeway', -72.15],
		[4, 'Chevron', -48.9],
		[6, 'Globex Inc Payroll', 3680.42],
		[9, 'Comcast Xfinity', -79.99],
		[12, 'Lyft', -22.4],
		[15, 'REI', -145.0],
		[20, 'Globex Inc Payroll', 3680.42],
		[23, 'Chipotle', -14.75],
		[27, 'Home Depot', -88.23]
	];
	for (const [days, desc, value] of bobChecking_txns) {
		await seedTxn(pb, bobChecking.id, bob.id, days, desc, value);
	}

	const bobVisa_txns: Array<[number, string, number]> = [
		[3, 'Best Buy', -329.99],
		[6, "Peet's Coffee", -4.85],
		[10, 'United Airlines', -287.1],
		[14, 'Airbnb', -612.0],
		[17, 'Barnes & Noble', -42.3],
		[21, 'Patagonia', -156.0],
		[25, 'Payment - Thank You', 450]
	];
	for (const [days, desc, value] of bobVisa_txns) {
		await seedTxn(pb, bobVisa.id, bob.id, days, desc, value);
	}

	// Shared joint checking transactions (mix of Alice and Bob actions)
	const joint_txns: Array<[number, string, number, string]> = [
		[1, 'Whole Foods Market', -156.32, alice.id],
		[3, 'PG&E - Joint', -198.44, bob.id],
		[5, 'Comcast Internet', -89.99, alice.id],
		[7, 'State Farm Insurance', -312.0, bob.id],
		[10, 'Rocket Mortgage', -2150.0, alice.id],
		[12, 'Alice Transfer from Checking', 1500, alice.id],
		[15, 'Bob Transfer from Checking', 1500, bob.id],
		[18, 'Trader Joes', -94.75, alice.id],
		[22, 'Home Depot', -234.5, bob.id],
		[26, 'Date night - Che Fico', -185.4, alice.id]
	];
	for (const [days, desc, value, owner] of joint_txns) {
		await seedTxn(pb, jointChecking.id, owner, days, desc, value);
	}

	// Joint mortgage payment transactions
	const mortgage_txns: Array<[number, string, number]> = [
		[10, 'Monthly Payment - Principal', 420.12],
		[10, 'Monthly Payment - Interest', 1729.88]
	];
	for (const [days, desc, value] of mortgage_txns) {
		await seedTxn(pb, jointMortgage.id, bob.id, days, desc, value);
	}

	console.log('\nDone!');
	console.log(`\nLogins (password: ${PASSWORD}):`);
	console.log(`  alice@example.com`);
	console.log(`  bob@example.com`);
	console.log('\nShares:');
	console.log(`  Alice -> Bob: "Joint Bank of America Checking" (NORMAL, included)`);
	console.log(`  Bob -> Alice: "Joint Mortgage" (NORMAL, included)`);
	console.log(`  Alice -> Bob: "Alice Ally Savings" (INVERSE, excluded)`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
