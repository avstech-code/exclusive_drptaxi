// Browser-side calls to our own API routes.
import type { BookingRequest, BookingResponse, PlaceSuggestion, TripQuote, TripSpec } from './types';

export class ApiFailure extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiFailure('Could not reach the server. Please check your connection and try again.', 0);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiFailure((body as { message?: string } | null)?.message || '', res.status);
  return body as T;
}

const json = (data: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

export const getRoute = (slug: string) => request(`/api/routes/${encodeURIComponent(slug)}`);
export const cityQuote = (fromSlug: string, toSlug: string | null, spec: TripSpec = {}) =>
  request<TripQuote>('/api/city-quote', json({ fromSlug, toSlug, ...spec }));
export const tripQuote = (fromPlaceId: string, toPlaceId: string | null, spec: TripSpec = {}) =>
  request<TripQuote>('/api/trip-quote', json({ fromPlaceId, toPlaceId, ...spec }));
export const createBooking = (body: BookingRequest) => request<BookingResponse>('/api/bookings', json(body));

/** Suggestions for the typed text, or null when the search itself failed (quota, outage) so the page can fall back. */
export async function autocomplete(q: string, session: string): Promise<PlaceSuggestion[] | null> {
  try {
    return await request<PlaceSuggestion[]>(`/api/places/autocomplete?q=${encodeURIComponent(q)}&session=${encodeURIComponent(session)}`);
  } catch {
    return null;
  }
}

/** Tells the office about an "Explore cabs" search. Fire and forget: a failure must never affect the visitor. */
export const sendEnquiry = (body: unknown) => {
  request('/api/enquiry', json(body)).catch(() => {});
};
