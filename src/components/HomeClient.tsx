'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CityCard } from './CityCard';
import { PlaceInput } from './PlaceInput';
import { cityQuote, tripQuote, sendEnquiry, ApiFailure } from '@/lib/api-client';
import { cityGradient, cityIcon } from '@/lib/city-theme';
import { inr, localDate, localTime, num } from '@/lib/format';
import { cityImageUrl, vehicleImageUrl } from '@/lib/types';
import type { City, FareQuote, PlaceSuggestion, RouteItem, Tariff, TripPackage, TripQuote, TripSpec } from '@/lib/types';

type TripTab = 'drop' | 'round' | 'package';
type Params = Record<string, string | number>;

interface Result {
  heading: string;
  note: string;
  dropdown: boolean;
  quotes: FareQuote[];
  params: Params;
}

/** Hero background pictures, shown one after another every HERO_SECONDS. */
const HERO_IMAGES = ['/hero/exclusive-1.jpg', '/hero/exclusive-2.jpg', '/hero/exclusive-3.jpg'];
const HERO_SECONDS = 7;

export function HomeClient({ cities, routes, tariff, packages, placesConfigured }: {
  cities: City[];
  routes: RouteItem[];
  tariff: Tariff | null;
  packages: TripPackage[];
  placesConfigured: boolean;
}) {
  const router = useRouter();
  const today = useMemo(() => localDate(), []);

  const [slide, setSlide] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSlide((i) => (i + 1) % HERO_IMAGES.length), HERO_SECONDS * 1000);
    return () => clearInterval(t);
  }, []);

  const [trip, setTripState] = useState<TripTab>('drop');
  const [placesDown, setPlacesDown] = useState(false);
  const placesEnabled = placesConfigured && !placesDown;
  const [fromPlace, setFromPlace] = useState<PlaceSuggestion | null>(null);
  const [toPlace, setToPlace] = useState<PlaceSuggestion | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [custName, setCustName] = useState('');
  const [custMobile, setCustMobile] = useState('');
  const [date, setDate] = useState(today);
  const [time, setTime] = useState(() => localTime());
  const [returnDate, setReturnDate] = useState('');
  const [packageHours, setPackageHours] = useState(8);
  const [prefill, setPrefill] = useState<{ from: string; to: string; nonce: number } | null>(null);
  const formEl = useRef<HTMLDivElement>(null);

  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [openCards, setOpenCards] = useState<number[]>([]);
  const faresEl = useRef<HTMLElement>(null);
  const citiesRow = useRef<HTMLDivElement>(null);

  const packageOn = tariff?.packageEnabled !== false;
  const gstOn = !!tariff?.gstEnabled;

  const cityGroups = useMemo(() => {
    const order = ['Tamil Nadu', 'Puducherry', 'Karnataka'];
    const byState = new Map<string, City[]>();
    for (const c of cities) byState.set(c.state, [...(byState.get(c.state) ?? []), c]);
    return [...byState.entries()]
      .map(([state, list]) => ({ state, cities: [...list].sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => (order.indexOf(a.state) + 1 || 99) - (order.indexOf(b.state) + 1 || 99) || a.state.localeCompare(b.state));
  }, [cities]);

  /** Every city for the scrolling row, cities with routes first. */
  const rowCities = useMemo(() => [...cities].sort((a, b) => Number(b.hasRoutes) - Number(a.hasRoutes) || a.name.localeCompare(b.name)), [cities]);

  /** Grouped by destination so each city's routes sit side by side: Chennai to X, then Bangalore to X, then the next city. */
  const popular = useMemo(() => {
    const order = (f: string) => (f === 'Chennai' ? 0 : f === 'Bangalore' ? 1 : 2);
    return [...routes].sort((a, b) => a.to.localeCompare(b.to) || order(a.from) - order(b.from) || a.from.localeCompare(b.from));
  }, [routes]);

  const cityByName = useMemo(() => new Map(cities.map((c) => [c.name, c])), [cities]);
  const [swapped, setSwapped] = useState<ReadonlySet<string>>(new Set());
  const [openRoutes, setOpenRoutes] = useState<ReadonlySet<string>>(new Set());
  const toggleIn = (set: ReadonlySet<string>, key: string, apply: (s: ReadonlySet<string>) => void) => {
    const next = new Set(set);
    if (!next.delete(key)) next.add(key);
    apply(next);
  };

  function routeView(r: RouteItem) {
    if (!swapped.has(r.slug)) return { from: r.from, to: r.to, slug: r.slug };
    const key = (n: string) => cityByName.get(n)?.slug ?? n.toLowerCase().replace(/\s+/g, '-');
    return { from: r.to, to: r.from, slug: `${key(r.to)}-to-${key(r.from)}-taxi` };
  }
  const routeBg = (name: string) => {
    const c = cityByName.get(name);
    return c?.images.length ? `center / cover url('${cityImageUrl(c.images[0].fileName)}')` : cityGradient(c?.slug ?? name);
  };
  const routeSplit = (distanceKm: number) => {
    const car = tariff?.vehicles.length ? [...tariff.vehicles].sort((a, b) => a.ratePerKm - b.ratePerKm)[0] : null;
    if (!tariff || !car) return null;
    const km = Math.max(distanceKm, tariff.minKm);
    const base = km * car.ratePerKm;
    const gst = tariff.gstEnabled ? (base + car.driverAllowance) * tariff.gstRate : 0;
    return { km, rate: car.ratePerKm, base, batta: car.driverAllowance, gst };
  };

  /**
   * The From box is reused across tabs and keeps its text, so the chosen pickup is kept too. The To box is
   * destroyed on the Package tab (and both boxes while Package is switched off), so their places are dropped.
   */
  function setTrip(tab: TripTab) {
    const formHidden = (t: TripTab) => t === 'package' && !packageOn;
    const boxesRecreated = formHidden(trip) || formHidden(tab);
    setTripState(tab);
    setResult(null);
    setQuoteError('');
    if (boxesRecreated) setFromPlace(null);
    if (boxesRecreated || tab === 'package') setToPlace(null);
  }

  const a = placesEnabled ? fromPlace?.placeId : from;
  const b = placesEnabled ? toPlace?.placeId : to;
  const contactOk = !!custName.trim() && /^[6-9][0-9]{9}$/.test(custMobile);
  const canSearch = contactOk && (trip === 'package'
    ? !!a && !!date && packages.some((p) => p.hours === packageHours)
    : !!a && !!b && a !== b && (trip !== 'round' || (!!date && !!returnDate && returnDate >= date)));

  const scrollToFares = () => setTimeout(() => faresEl.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));

  function minKmNote(distanceKm: number): string {
    const min = tariff?.minKm ?? 0;
    return min > 0 && distanceKm < min ? `Minimum of ${min} kms coverage charges is applicable.` : '';
  }

  function roundTripNote(q: TripQuote): string {
    const billed = q.quotes[0]?.billableKm ?? 0;
    if (!q.days || billed <= q.distanceKm * 2) return `Billed for the distance travelled: ${billed} km.`;
    return `Minimum ${billed / q.days} km per calendar day × ${q.days} ${q.days === 1 ? 'day' : 'days'} = ${billed} km billed.`;
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!canSearch || !a) return;
    setQuoteError('');
    setResult(null);
    setQuoting(true);
    scrollToFares();

    const tab = trip;
    const dropId = tab === 'package' ? null : (b ?? null);
    const dateParams: Params = { ...(date ? { date } : {}), ...(time ? { time } : {}) };
    // the booking page gets the same trip: place ids in Google mode, city slugs in dropdown mode
    const ends: Params = placesEnabled ? { from: a, ...(dropId ? { to: dropId } : {}) } : { fromCity: a, ...(dropId ? { toCity: dropId } : {}) };
    let spec: TripSpec = {};
    let params: Params = { ...ends, ...dateParams };
    if (tab === 'round') {
      spec = { tripType: 'ROUND_TRIP', pickupDate: date, returnDate };
      params = { type: 'round', ...ends, return: returnDate, ...dateParams };
    } else if (tab === 'package') {
      spec = { tripType: 'PACKAGE', packageHours };
      params = { type: 'package', ...ends, hours: packageHours, ...dateParams };
    }
    try {
      const q = placesEnabled ? await tripQuote(a, dropId, spec) : await cityQuote(a, dropId, spec);
      const where = tab === 'package'
        ? `${q.from} · ${q.to}`
        : `${q.from} to ${q.to} · ${q.distanceKm} km${tab === 'round' ? ` each way, ${q.days} ${q.days === 1 ? 'day' : 'days'}` : ''}`;
      setResult({
        heading: where, quotes: q.quotes, params, dropdown: q.mode === 'ESTIMATE',
        note: tab === 'round' ? roundTripNote(q) : tab === 'drop' ? minKmNote(q.distanceKm) : '',
      });
      setOpenCards([]);
      sendEnquiry({
        customerName: custName.trim(), mobile: custMobile,
        tripType: tab === 'round' ? 'ROUND_TRIP' : tab === 'package' ? 'PACKAGE' : 'ONE_WAY',
        from: q.from, to: q.to, pickupDate: date || null, pickupTime: time || null,
        returnDate: tab === 'round' ? returnDate : null, packageHours: tab === 'package' ? packageHours : null,
        distanceKm: q.distanceKm, fares: q.quotes.map((f) => ({ vehicle: f.vehicle, total: f.total })),
      });
    } catch (err) {
      setQuoteError((err instanceof ApiFailure && err.message) || 'We could not price this trip. Please try again.');
    } finally {
      setQuoting(false);
      scrollToFares();
    }
  }

  function bookNow(vehicleId: number) {
    if (!result) return;
    // name and mobile travel to the booking page through sessionStorage, not the URL
    try { sessionStorage.setItem('enquiryContact', JSON.stringify({ name: custName.trim(), mobile: custMobile })); } catch { /* private mode */ }
    const q = new URLSearchParams(Object.entries({ ...result.params, vehicle: vehicleId }).map(([k, v]) => [k, String(v)]));
    router.push(`/book?${q}`);
  }

  /** Book now on a route tile: fill the enquiry form with that route and scroll up to it instead of opening another page. */
  function pickRoute(fromName: string, toName: string) {
    const slugOf = (n: string) => cityByName.get(n)?.slug ?? n.toLowerCase().replace(/\s+/g, '-');
    setTripState('drop');
    setResult(null);
    setQuoteError('');
    setFromPlace(null);
    setToPlace(null);
    setFrom(slugOf(fromName));
    setTo(slugOf(toName));
    setPrefill({ from: fromName, to: toName, nonce: Date.now() });
    formEl.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const toggleCard = (id: number) => setOpenCards((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  const cityOptions = (id: string, name: string, value: string, set: (v: string) => void, placeholder: string, label: string) => (
    <div className="field">
      <label className="req" htmlFor={id}>{label}</label>
      <select id={id} name={name} value={value} onChange={(e) => set(e.target.value)}>
        <option value="" disabled>{placeholder}</option>
        {cityGroups.map((g) => (
          <optgroup key={g.state} label={g.state}>
            {g.cities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </optgroup>
        ))}
      </select>
    </div>
  );

  return (
    <>
      <section className="hero">
        <div className="hero-bg" aria-hidden="true">
          {HERO_IMAGES.map((src, i) => <div key={src} className={`hero-slide${i === slide ? ' active' : ''}`} style={{ backgroundImage: `url(${src})` }} />)}
        </div>
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <span className="hero-badge"><b>★</b> Tamil Nadu · Puducherry · Bangalore drop taxi</span>
            <h1>The Best Taxi Service At Your <span className="hl">Door Step</span></h1>
            <p className="hero-lead">Reliable one way and round trip taxis across Tamil Nadu, Pondicherry and Bangalore. Professional drivers, transparent pricing and a comfortable ride.</p>
          </div>

          <div className="widget card" id="enquiry" ref={formEl}>
            <h2 className="widget-title">Enquire here</h2>
            <div className="trip-tabs" role="tablist" aria-label="Trip type">
              {([['drop', 'One Way'], ['round', 'Round Trip']] as const).map(([key, name]) => (
                <button key={key} type="button" role="tab" className={`trip-tab${trip === key ? ' active' : ''}`} aria-selected={trip === key} onClick={() => setTrip(key)}>{name}</button>
              ))}
            </div>

            <div className="widget-body">
              {trip === 'package' && !packageOn ? (
                <p className="service-off" role="status">Sorry for the inconvenience, for now this service is not available.</p>
              ) : (
                <form onSubmit={search}>
                  {placesDown && <p className="city-note">Place search is unavailable right now. Please choose your cities from the list.</p>}
                  <div className="search-grid">
                    {placesEnabled ? (
                      <>
                        <PlaceInput key={`${trip === 'package' ? 'p' : 'o'}-from`} inputId={`${trip}-from`} label="From" placeholder="Enter pickup location" onSelected={setFromPlace} onUnavailable={() => setPlacesDown(true)} prefill={prefill && { text: prefill.from, nonce: prefill.nonce }} />
                        {trip !== 'package' && <PlaceInput inputId={`${trip}-to`} label="To" placeholder="Enter drop location" onSelected={setToPlace} onUnavailable={() => setPlacesDown(true)} prefill={prefill && { text: prefill.to, nonce: prefill.nonce }} />}
                      </>
                    ) : (
                      <>
                        {cityOptions('sel-from', 'from', from, setFrom, 'Pickup city', 'From')}
                        {trip !== 'package' && cityOptions('sel-to', 'to', to, setTo, 'Drop city', 'To')}
                      </>
                    )}

                    {trip === 'package' && (
                      <div className="field">
                        <label className="req" htmlFor="package">Package</label>
                        <select id="package" name="package" value={packageHours} onChange={(e) => setPackageHours(Number(e.target.value))}>
                          {packages.map((p) => <option key={p.hours} value={p.hours}>{p.hours} hrs / {p.km} km</option>)}
                        </select>
                      </div>
                    )}

                    <div className="field">
                      <label className="req" htmlFor="date">Pick up date</label>
                      <input id="date" name="date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
                    </div>
                    <div className="field">
                      <label className="req" htmlFor="time">Pick up time</label>
                      <input id="time" name="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                    </div>
                    {trip === 'round' && (
                      <div className="field">
                        <label className="req" htmlFor="return">Return date</label>
                        <input id="return" name="return" type="date" min={date || today} value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
                      </div>
                    )}
                    <div className="field">
                      <label className="req" htmlFor="enq-name">Your name</label>
                      <input id="enq-name" name="name" required autoComplete="name" maxLength={100} placeholder="Full name" value={custName} onChange={(e) => setCustName(e.target.value)} />
                    </div>
                    <div className="field">
                      <label className="req" htmlFor="enq-mobile">Mobile number</label>
                      <input id="enq-mobile" name="mobile" type="tel" inputMode="numeric" required autoComplete="tel-national" pattern="[6-9][0-9]{9}" maxLength={10} placeholder="10 digit mobile number" value={custMobile} onChange={(e) => setCustMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} />
                    </div>
                  </div>
                  <button className="btn" type="submit" disabled={!canSearch}>Explore cabs</button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {quoting ? (
        <section className="section fares" ref={faresEl}><div className="wrap"><p className="route-note">Calculating your fare…</p></div></section>
      ) : quoteError ? (
        <section className="section fares" ref={faresEl}><div className="wrap"><p className="error" role="alert">{quoteError}</p></div></section>
      ) : result ? (
        <section className="section fares" ref={faresEl} aria-live="polite">
          <div className="wrap">
            <h2 className="section-title">Available vehicles!</h2>
            <p className="fares-sub">{result.heading}</p>
            {result.note && <p className="fares-sub fares-note">{result.note}</p>}
            {result.dropdown && (
              <p className="fares-sub fares-note">Due to a problem in Google Maps, the kms may be higher. Please contact the office for the exact price range. Thank you.</p>
            )}
            <div className="fare-grid">
              {result.quotes.map((q) => {
                const open = openCards.includes(q.vehicleId);
                return (
                  <article key={q.vehicleId} className={`fare-card${open ? ' open' : ''}`}>
                    <span className="fare-badge">Best price</span>
                    <div className="fare-top">
                      {q.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="fare-photo" src={vehicleImageUrl(q.image)} alt={q.vehicle} loading="lazy" />
                      ) : (
                        <div className="fare-car" aria-hidden="true">{q.seats > 4 ? '🚐' : '🚗'}</div>
                      )}
                    </div>
                    <div className="fare-body">
                      <h3 className="fare-name">{q.vehicle} <span className="seat-chip">{q.seats}+1</span></h3>
                      <p className="fare-total"><small>Estimated fare</small>{inr(q.total, 2)}</p>
                      <div className="fare-actions">
                        <button className="fare-details-btn" type="button" aria-expanded={open} onClick={() => toggleCard(q.vehicleId)}>{open ? 'Hide details' : 'Show details'}</button>
                        <button className="fare-book" type="button" onClick={() => bookNow(q.vehicleId)}>Book now</button>
                      </div>
                      <dl className="fare-rows">
                        <div><dt>Distance</dt><dd>{q.billableKm} km</dd></div>
                        <div><dt>Rate / km</dt><dd>{num(q.ratePerKm, 2)}</dd></div>
                        <div><dt>Base charge</dt><dd>{num(q.baseFare, 2)}</dd></div>
                        <div><dt>Driver batta</dt><dd>{num(q.driverAllowance, 2)}</dd></div>
                        <div><dt>Toll &amp; permit</dt><dd>Extra (actuals)</dd></div>
                        {gstOn && <div><dt>GST</dt><dd>{num(q.gst, 2)}</dd></div>}
                      </dl>
                      <p className="fare-note">
                        {gstOn ? '*Inclusive of GST. ' : '*'}Toll and permit charges are extra and paid as per actuals.
                        Actual bill may vary based on distance, waiting time and night charges.
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      <section className="section">
        <div className="wrap">
          <h2 className="section-title">Why book with us</h2>
          <div className="grid">
            <div className="tile"><span className="icon" aria-hidden="true">🛣️</span><h3>Pay one way only</h3><p>You are charged for the trip you take, not for the driver&apos;s return.</p></div>
            <div className="tile"><span className="icon" aria-hidden="true">🧾</span><h3>Fare before you book</h3><p>See the total for every car type on the route page before you commit.</p></div>
            <div className="tile"><span className="icon" aria-hidden="true">💰</span><h3>Inclusive pricing</h3><p>Driver batta{gstOn ? ' and GST' : ''} {gstOn ? 'are' : 'is'} in the total shown. Tolls and permit fees are extra, as per actuals.</p></div>
            <div className="tile"><span className="icon" aria-hidden="true">🚗</span><h3>Choose your car</h3><p>Pick the vehicle that fits your group and luggage from the published tariff.</p></div>
          </div>
        </div>
      </section>

      {rowCities.length > 0 && (
        <section className="section alt">
          <div className="wrap">
            <h2 className="section-title">Cities we serve</h2>
            <div className="cities-row-wrap">
              <button type="button" className="row-btn left" aria-label="Scroll cities left" onClick={() => citiesRow.current?.scrollBy({ left: -320, behavior: 'smooth' })}>‹</button>
              <div className="cities-row" ref={citiesRow}>
                {rowCities.map((c) => <CityCard key={c.slug} city={c} />)}
              </div>
              <button type="button" className="row-btn right" aria-label="Scroll cities right" onClick={() => citiesRow.current?.scrollBy({ left: 320, behavior: 'smooth' })}>›</button>
            </div>
            <Link className="link-more" href="/major-cities">See all {cities.length} cities</Link>
          </div>
        </section>
      )}

      {popular.length > 0 && (
        <section className="section routes-dark">
          <div className="wrap wide">
            <h2 className="section-title">Routes we serve</h2>
            <div className="route-grid">
              {popular.map((r) => {
                const v = routeView(r);
                const open = openRoutes.has(r.slug);
                const split = open ? routeSplit(r.distanceKm) : null;
                const toCity = cityByName.get(v.to);
                return (
                  <div
                    className="route-tile"
                    key={r.slug}
                    onClick={(e) => {
                      // the buttons and the Book now link keep their own actions; anywhere else on the tile picks the route
                      if ((e.target as HTMLElement).closest('button, a')) return;
                      pickRoute(v.from, v.to);
                    }}
                  >
                    <span className="route-photo" style={{ background: routeBg(v.to) }}>
                      {!toCity?.images.length && <span className="route-emoji" aria-hidden="true">{cityIcon(toCity?.slug ?? v.to)}</span>}
                    </span>
                    <span className="route-info">
                      <span className="route-head">
                        <span className="route-title">{v.from} To {v.to}</span>
                        <button type="button" className="route-swap" onClick={() => toggleIn(swapped, r.slug, setSwapped)} aria-label={`Switch to ${v.to} to ${v.from}`} title="Switch direction">
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 4 3 8l4 4" /><path d="M3 8h13" /><path d="m17 20 4-4-4-4" /><path d="M21 16H8" /></svg>
                        </button>
                      </span>
                      <span className="route-sub">One Way <i></i> {r.distanceKm} Km <i></i> SEDAN</span>
                      <span className="route-bottom">
                        {r.fromFare !== null && <span className="route-price">Rs.{num(r.fromFare, 0)}</span>}
                        <span className="route-actions">
                          <button type="button" className="route-details" aria-expanded={open} onClick={() => toggleIn(openRoutes, r.slug, setOpenRoutes)}>{open ? 'Hide details' : 'Show details'}</button>
                          <Link className="route-book" href={`/${v.slug}`} onClick={(e) => { e.preventDefault(); pickRoute(v.from, v.to); }}>Book Now</Link>
                        </span>
                      </span>
                    </span>
                    {split && (
                      <p className="route-split" aria-label="Fare split-up">
                        <span>{num(split.km, 0, 1)} km</span>
                        <span>₹{num(split.rate, 0, 2)}/km</span>
                        <span><b>Base</b> {num(split.base, 0)}</span>
                        <span><b>Batta</b> {num(split.batta, 0)}</span>
                        {split.gst > 0 && <span><b>GST</b> {num(split.gst, 0)}</span>}
                        <span><b>Toll</b> extra</span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
