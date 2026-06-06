import { fetchWithRetry } from './api';

export const fetcher = (url: string) => fetchWithRetry(url);
