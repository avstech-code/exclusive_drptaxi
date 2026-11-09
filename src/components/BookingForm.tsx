'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiFailure, cityQuote, createBooking, getRoute, tripQuote } from '@/lib/api-client';
import { formatDuration, inr, localDate, localTime, num } from '@/lib/format';
import type { BookingRequest, BookingResponse, FareQuote, RouteResponse, TripKind, TripQuote, TripSpec } from '@/lib/types';

/** What the page shows about the trip, whether it came from a stored route or from two places. */
interface TripView {
  from: string;
  to: string;
  distanceKm: number;
  durationMinutes: number | null;
  quotes: FareQuote[];
  /** True when tolls and permit fees are not in the prices. */
  tollsExtra: boolean;
  /** True for a dropdown-mode quote, whose km are estimated. */
  dropdown?: boolean;
  /** Round trip length in days; 0 when not a round trip. */
  days: number;
}

/** Set once the reload check has run for this document load, so later visits to the page inside the app are left alone. */
let reloadChecked = false;

export function BookingForm({ params, gst }: { params: Record<string, string>; gst: boolean }) {
  const kind: TripKind = params.type === 'round' ? 'ROUND_TRIP' : params.type === 'package' ? 'PACKAGE' : 'ONE_WAY';
  const today = useMemo(() => localDate(), []);
  const pickup = params.from;
  const drop = params.to;
  const pickupCity = params.fromCity;
  const dropCity = params.toCity;
  const routeSlug = params.route;
  const hasTrip = !!routeSlug || !!(pickup && (drop || kind === 'PACKAGE')) || !!(pickupCity && (dropCity || kind === 'PACKAGE'));

  const [trip, setTrip] = useState<TripView | null>(null);
  const [loading, setLoading] = useState(hasTrip);
  const [loadError, setLoadError] = useState('');
  const [done, setDone] = useState<BookingResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // identifies the trip for the booking request (set once the quote is loaded)
  const [target, setTarget] = useState<Partial<BookingRequest>>({});

  const [form, setForm] = useState({
    vehicleId: 0,
    customerName: '',
    mobile: '',
    email: '',
    pickupDate: params.date || today,
    pickupTime: params.time || '',
    returnDate: params.return ?? '',
    passengers: 1,
    luggage: 0 as number | string,
    pickupAddress: '',
    notes: '',
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const packageHours = Number(params.hours) || undefined;
  const started = useRef(false);
  const router = useRouter();

  // a browser refresh of the booking page starts over from the home page (only when this page itself was the one reloaded)
  useEffect(() => {
    if (reloadChecked) return;
    reloadChecked = true;
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type === 'reload' && new URL(nav.name).pathname === '/book') router.replace('/');
  }, [router]);

  const heading = kind === 'ROUND_TRIP' ? 'Book your round trip taxi' : kind === 'PACKAGE' ? 'Book your package taxi' : 'Book your one way drop taxi';

  function show(t: TripView) {
    const wanted = Number(params.vehicle);
    setForm((f) => ({ ...f, vehicleId: t.quotes.find((q) => q.vehicleId === wanted)?.vehicleId ?? t.quotes[0]?.vehicleId ?? 0 }));
    setLoading(false);
    setTrip(t);
  }

  function fetchQuote(first: boolean, pickupDate: string, returnDate: string) {
    const spec: TripSpec = { tripType: kind, pickupDate: pickupDate || undefined, returnDate: returnDate || undefined, packageHours };
    const dropId = kind === 'PACKAGE' ? null : pickupCity ? (dropCity ?? null) : (drop ?? null);
    const request = pickupCity ? cityQuote(pickupCity, dropId, spec) : tripQuote(pickup!, dropId, spec);
    request.then(
      (q: TripQuote) => {
        setTarget(pickupCity
          ? { fromCitySlug: pickupCity, toCitySlug: dropId ?? undefined }
          : { fromPlaceId: q.fromPlaceId ?? undefined, toPlaceId: q.toPlaceId ?? undefined });
        const view: TripView = {
          from: q.from, to: q.to, distanceKm: q.distanceKm, durationMinutes: q.durationMinutes, quotes: q.quotes,
          tollsExtra: q.tollsExtra, dropdown: q.mode === 'ESTIMATE', days: kind === 'ROUND_TRIP' ? q.days : 0,
        };
        if (first) show(view);
        else {
          setError('');
          setTrip(view);
        }
      },
      (e: unknown) => {
        const message = (e instanceof ApiFailure && e.message) || 'We could not price this trip. Please try again.';
        if (first) {
          setLoading(false);
          setLoadError(message);
        } else setError(message);
      },
    );
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!form.pickupTime) set('pickupTime', localTime());
    // name and mobile entered in the home page enquiry form
    try {
      const saved = JSON.parse(sessionStorage.getItem('enquiryContact') || 'null');
      if (saved && typeof saved.name === 'string' && typeof saved.mobile === 'string') setForm((f) => ({ ...f, customerName: f.customerName || saved.name, mobile: f.mobile || saved.mobile }));
    } catch { /* ignore */ }
    if (routeSlug) {
      getRoute(routeSlug).then(
        (r) => {
          const route = r as RouteResponse;
          setTarget({ routeSlug: route.slug });
          show({ from: route.from, to: route.to, distanceKm: route.distanceKm, durationMinutes: null, quotes: route.quotes, tollsExtra: true, days: 0 });
        },
        () => {
          setLoading(false);
          setLoadError('We could not find that route.');
        },
      );
    } else if (hasTrip) fetchQuote(true, form.pickupDate, form.returnDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Round trip prices depend on the number of days, so ask the server again when a date changes. */
  function requote(pickupDate: string, returnDate: string) {
    if (kind === 'ROUND_TRIP' && pickupDate && returnDate && returnDate >= pickupDate) fetchQuote(false, pickupDate, returnDate);
  }

  async function submit(e: React.FormEvent, t: TripView) {
    e.preventDefault();
    const f = form;
    if (!f.customerName.trim() || !/^[6-9][0-9]{9}$/.test(f.mobile) || !f.pickupDate || !f.pickupTime || !f.pickupAddress.trim()) {
      return setError('Please fill in your name, a 10 digit mobile number, pickup date, time and address.');
    }
    const seats = t.quotes.find((q) => q.vehicleId === f.vehicleId)?.seats ?? 0;
    if (f.passengers > seats) return setError(`This vehicle seats ${seats} passengers. Choose a larger vehicle.`);
    if (kind === 'ROUND_TRIP' && (!f.returnDate || f.returnDate < f.pickupDate)) return setError('Please choose a return date on or after the pickup date.');
    setError('');
    setBusy(true);
    try {
      setDone(await createBooking({
        ...target,
        tripType: kind,
        returnDate: kind === 'ROUND_TRIP' ? f.returnDate : undefined,
        packageHours: kind === 'PACKAGE' ? packageHours : undefined,
        vehicleId: f.vehicleId,
        customerName: f.customerName,
        mobile: f.mobile,
        email: f.email,
        pickupDate: f.pickupDate,
        pickupTime: f.pickupTime,
        passengers: f.passengers,
        luggage: Number(f.luggage) || 0, // luggage is optional: an empty box counts as no bags
        pickupAddress: f.pickupAddress,
        notes: f.notes,
      }));
    } catch (err) {
      setError((err instanceof ApiFailure && err.message) || 'We could not complete the booking. Please check the details and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>{heading}</h1>

      {done ? (
        <section className="card">
          <h2>Booking received</h2>
          <p>
            Your reference is <strong>{done.reference}</strong>. {done.from} to {done.to} in a {done.vehicle} for <strong>{inr(done.total, 0)}</strong>.
          </p>
          <p className="note">Status: {done.status}. We will contact you on your mobile number to confirm the trip.</p>
          <p><Link href="/">Back to home</Link></p>
        </section>
      ) : trip ? (
        <>
          <p>
            {kind === 'PACKAGE' ? (
              <><strong>{trip.from}</strong> · {trip.to}</>
            ) : (
              <>
                <strong>{trip.from} to {trip.to}</strong> · {trip.distanceKm} km
                {kind === 'ROUND_TRIP' ? ' each way, returning to the pickup' : trip.durationMinutes ? ` · about ${formatDuration(trip.durationMinutes)}` : ''}
              </>
            )}{' '}
            <Link href={routeSlug ? `/${routeSlug}` : '/'}>(change)</Link>
          </p>

          {trip.dropdown && (
            <p className="note city-note">Due to a problem in Google Maps, the kms may be higher. Please contact the office for the exact price range. Thank you.</p>
          )}

          <form className="card book-form" onSubmit={(e) => submit(e, trip)} noValidate>
            <div className="book-cols">
            <div className="book-col">
            <fieldset>
              <legend className="req">Choose a vehicle</legend>
              {trip.quotes.map((q) => (
                <div key={q.vehicleId} className={`choice${form.vehicleId === q.vehicleId ? ' selected' : ''}`}>
                  <label className="choice-main">
                    <input type="radio" name="vehicle" checked={form.vehicleId === q.vehicleId} onChange={() => set('vehicleId', q.vehicleId)} />
                    {q.vehicle} <span className="note">({q.seats}+1 seats)</span>
                    <span className="price">{inr(q.total, 0)}</span>
                  </label>
                  {form.vehicleId === q.vehicleId && (
                    <p className="choice-split" aria-label="Fare split-up">
                      <span><b>Distance</b> {num(q.billableKm, 0, 1)} km</span>
                      <span><b>Rate</b> {inr(q.ratePerKm, 2)}/km</span>
                      <span><b>Base</b> {inr(q.baseFare, 2)}</span>
                      <span><b>Batta</b> {inr(q.driverAllowance, 2)}</span>
                      {q.gst > 0 && <span><b>GST</b> {inr(q.gst, 2)}</span>}
                      <span><b>Toll &amp; permit</b> extra</span>
                    </p>
                  )}
                </div>
              ))}
            </fieldset>
            </div>

            <div className="book-col book-details">
              <h3 className="book-step-title">Your details</h3>

              <div className="book-pair">
                <div>
                  <label className="req" htmlFor="name">Your name</label>
                  <input id="name" name="name" required maxLength={100} value={form.customerName} onChange={(e) => set('customerName', e.target.value)} autoComplete="name" />
                </div>
                <div>
                  <label className="req" htmlFor="mobile">Mobile number</label>
                  <input id="mobile" name="mobile" required inputMode="numeric" maxLength={10} pattern="[6-9][0-9]{9}" value={form.mobile} onChange={(e) => set('mobile', e.target.value)} autoComplete="tel-national" />
                </div>
              </div>

              <div>
                <label htmlFor="email">Email (optional)</label>
                <input id="email" name="email" type="email" maxLength={150} value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" />
              </div>

              <div className="book-pair">
                <div>
                  <label className="req" htmlFor="date">Pickup date</label>
                  <input id="date" name="date" type="date" required min={today} value={form.pickupDate}
                    onChange={(e) => { set('pickupDate', e.target.value); requote(e.target.value, form.returnDate); }} />
                </div>
                <div>
                  <label className="req" htmlFor="time">Pickup time</label>
                  <input id="time" name="time" type="time" required value={form.pickupTime} onChange={(e) => set('pickupTime', e.target.value)} />
                </div>
              </div>

              {kind === 'ROUND_TRIP' && (
                <div>
                  <label className="req" htmlFor="return">Return date</label>
                  <input id="return" name="return" type="date" required min={form.pickupDate || today} value={form.returnDate}
                    onChange={(e) => { set('returnDate', e.target.value); requote(form.pickupDate, e.target.value); }} />
                  {trip.days > 0 && <p className="note">{trip.days} {trip.days === 1 ? 'day' : 'days'}. The price is recalculated when you change the dates.</p>}
                </div>
              )}

              <div>
                <label className="req" htmlFor="address">Pickup address</label>
                <input id="address" name="address" required maxLength={300} value={form.pickupAddress} onChange={(e) => set('pickupAddress', e.target.value)} />
              </div>

              <div className="two-col">
                <div>
                  <label className="req" htmlFor="pax">Passengers</label>
                  <input id="pax" name="pax" type="number" min={1} max={12} required value={form.passengers} onChange={(e) => set('passengers', Number(e.target.value))} />
                </div>
                <div>
                  <label htmlFor="bags">Luggage (bags)</label>
                  <input id="bags" name="bags" type="number" min={0} max={20} value={form.luggage} onChange={(e) => set('luggage', e.target.value)} />
                </div>
              </div>

              <div>
                <label htmlFor="notes">Notes (optional)</label>
                <input id="notes" name="notes" maxLength={500} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
              </div>
            </div>
            </div>

            {error &&<p className="error" role="alert">{error}</p>}

            <div className="book-bar">
              {(() => {
                const chosen = trip.quotes.find((q) => q.vehicleId === form.vehicleId);
                return chosen && (
                  <div className="book-bar-total">
                    <small>{chosen.vehicle} · Total</small>
                    <strong>{inr(chosen.total, 0)}</strong>
                  </div>
                );
              })()}
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Booking…' : 'Book now'}</button>
            </div>
            {trip.tollsExtra ? (
              <p className="note">
                The price is calculated by our server from the road distance and includes driver batta{gst ? ' and GST' : ''}.
                Tolls and permit fees are extra and paid as per actuals.
              </p>
            ) : (
              <p className="note">The price is calculated by our server when you book and includes driver batta{gst ? ' and GST' : ''}. Toll and permit charges are extra, as per actuals.</p>
            )}
          </form>
        </>
      ) : loadError ? (
        <>
          <p className="error" role="alert">{loadError}</p>
          <p><Link href="/">Search again</Link></p>
        </>
      ) : loading ? (
        <p>Calculating your fare…</p>
      ) : (
        <p>Choose a route first. <Link href="/">Search a route</Link></p>
      )}
    </>
  );
}
