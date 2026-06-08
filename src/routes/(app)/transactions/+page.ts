import { redirect } from '@sveltejs/kit';

import type { PageLoad } from './$types';

export const load: PageLoad = ({ url }) => {
	if (url.searchParams.get('view') !== 'securities') return;

	const params = new URLSearchParams(url.searchParams);
	params.delete('view');
	const search = params.toString();
	redirect(307, `/transactions/holdings${search ? `?${search}` : ''}`);
};
