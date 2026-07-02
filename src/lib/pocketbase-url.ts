import { env } from '$env/dynamic/public';

export const getBackendUrl = () => env.PUBLIC_PB_URL || 'http://127.0.0.1:42070';
