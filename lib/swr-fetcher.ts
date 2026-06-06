import { fetchWithRetry } from './api';

export const fetcher = <T>(url: string): Promise<T> => fetchWithRetry<T>(url);
