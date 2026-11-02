'use client';

import { useState } from 'react';
import { adminRequest, ApiFailure } from '@/lib/api-client';
import { inr } from '@/lib/format';
import { BOOKING_STATUSES, cityImageUrl, vehicleImageUrl, type TripKind, type TripPackage } from '@/lib/types';

interface BookingRow {
  reference: string; status: string; tripType: TripKind; from: string; to: string; fromSlug: string | null; toSlug: string | null;
  vehicleId: number; vehicle: string; customerName: string; mobile: string; email: string | null; pickupDate: string; pickupTime: string;
  passengers: number; luggage: number; pickupAddress: string; notes: string | null; total: number; createdAt: string;
  returnDate: string | null; packageHours: number | null; packageKm: number | null;
}

interface VehicleRow {
  id: number; name: string; seats: number; ratePerKm: number; driverAllowance: number;
  roundTripRatePerKm: number; roundTripDriverAllowance: number; image: string | null; active: boolean;
}

interface TariffLine { vehicle: VehicleRow; rate: string; batta: string; rtRate: string; rtBatta: string; busy: boolean; message: string }
interface AdminImage { id: number; fileName: string; credit: string | null; sourceUrl: string | null }
interface AdminCity { name: string; slug: string; state: string; description: string | null; details: string | null; popularSpots: string[]; images: AdminImage[] }
interface Settings { gstEnabled: boolean; packageEnabled: boolean; placesEnabled: boolean; supportPhone: string; whatsappNumber: string }

const MAX_UPLOAD = 4 * 1024 * 1024;
const tripLabel = (t: TripKind) => (t === 'ROUND_TRIP' ? 'Round trip' : t === 'PACKAGE' ? 'Package' : 'One way');
const toLine = (v: VehicleRow): TariffLine => ({ vehicle: v, rate: String(v.ratePerKm), batta: String(v.driverAllowance), rtRate: String(v.roundTripRatePerKm), rtBatta: String(v.roundTripDriverAllowance), busy: false, message: '' });

function failure(e: unknown, fallback: string): string {
  if (e instanceof ApiFailure) return e.status === 401 ? 'Invalid admin token.' : e.message || fallback;
  return fallback;
}

export function AdminPanel({ routeCities, packages }: { routeCities: { slug: string; name: string }[]; packages: TripPackage[] }) {
  // Held in memory only: it is gone on reload and never written to storage.
  const [token, setToken] = useState('');
  const [connected, setConnected] = useState(false);
  const [tab, setTab] = useState<'bookings' | 'tariff' | 'cities'>('bookings');
  const [error, setError] = useState('');
  const [setupMsg, setSetupMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [rows, setRows] = useState<BookingRow[] | null>(null);
  const [selected, setSelected] = useState<BookingRow | null>(null);
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState('');
  const [panelBusy, setPanelBusy] = useState(false);
  const [panelError, setPanelError] = useState('');
  const [panelOk, setPanelOk] = useState('');

  const [tariff, setTariff] = useState<TariffLine[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [switchMsg, setSwitchMsg] = useState<Record<string, string>>({});
  const [switchBusy, setSwitchBusy] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactWhatsapp, setContactWhatsapp] = useState('');
  const [contactMsg, setContactMsg] = useState('');
  const [contactBusy, setContactBusy] = useState(false);

  const [cities, setCities] = useState<AdminCity[]>([]);
  const [cityEdit, setCityEdit] = useState<AdminCity | null>(null);
  const [cityForm, setCityForm] = useState({ description: '', details: '', spots: '' });
  const [cityBusy, setCityBusy] = useState(false);
  const [cityError, setCityError] = useState('');
  const [cityOk, setCityOk] = useState('');
  const [uploadCredit, setUploadCredit] = useState('');
  const [uploadSource, setUploadSource] = useState('');

  const call = <T,>(path: string, method = 'GET', body?: unknown) => adminRequest<T>(token, path, method, body);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const vehicles = await call<VehicleRow[]>('/vehicles');
      setTariff(vehicles.map(toLine));
      setConnected(true);
      call<Settings>('/settings').then((s) => {
        setSettings(s);
        setContactPhone(s.supportPhone);
        setContactWhatsapp(s.whatsappNumber);
      }).catch(() => undefined);
      await loadBookings();
    } catch (err) {
      setError(err instanceof ApiFailure && err.status === 401 ? 'Invalid admin token.'
        : err instanceof ApiFailure && err.status === 503 ? 'Admin access is not configured on the server.' : 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  /** First-time setup for a new database: creates the tables and fills only empty ones (same as POST /api/admin/seed). */
  async function setupDatabase() {
    setBusy(true);
    setError('');
    setSetupMsg('');
    try {
      await call<Record<string, string>>('/seed', 'POST');
      setSetupMsg('Database is ready. Now sign in.');
    } catch (err) {
      setError(err instanceof ApiFailure && err.status === 401 ? 'Invalid admin token.'
        : err instanceof ApiFailure && err.status === 503 ? 'Admin access is not configured on the server.' : 'Could not set up the database.');
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    setToken('');
    setConnected(false);
    setRows(null);
    closeDetails();
    setCities([]);
    setCityEdit(null);
    setTariff([]);
    setError('');
  }

  async function loadBookings(q = query, status = statusFilter) {
    setBusy(true);
    setError('');
    try {
      setRows(await call<BookingRow[]>(`/bookings?q=${encodeURIComponent(q.trim())}&status=${encodeURIComponent(status)}`));
    } catch (e) {
      setError(failure(e, 'Could not load bookings.'));
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setQuery('');
    setStatusFilter('');
    loadBookings('', '');
  }

  function openDetails(b: BookingRow) {
    setSelected(b);
    setPanelError('');
    setPanelOk('');
    setForm({
      fromSlug: b.fromSlug ?? '', toSlug: b.toSlug ?? '', vehicleId: b.vehicleId, tripType: b.tripType, returnDate: b.returnDate ?? b.pickupDate,
      packageHours: b.packageHours ?? packages[0]?.hours ?? null, customerName: b.customerName, mobile: b.mobile, email: b.email ?? '',
      pickupDate: b.pickupDate, pickupTime: b.pickupTime, pickupAddress: b.pickupAddress, passengers: b.passengers, luggage: b.luggage,
      notes: b.notes ?? '', total: b.total,
    });
  }

  function closeDetails() {
    setSelected(null);
    setForm(null);
    setPanelError('');
    setPanelOk('');
  }

  const replaceRow = (updated: BookingRow) => setRows((list) => list?.map((r) => (r.reference === updated.reference ? updated : r)) ?? null);

  async function saveBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !form) return;
    setPanelBusy(true);
    setPanelError('');
    setPanelOk('');
    try {
      const body = {
        ...form,
        returnDate: form.tripType === 'ROUND_TRIP' ? form.returnDate : null,
        packageHours: form.tripType === 'PACKAGE' ? form.packageHours : null,
        luggage: Number(form.luggage), passengers: Number(form.passengers), total: Number(form.total), vehicleId: Number(form.vehicleId),
      };
      const updated = await call<BookingRow>(`/bookings/${encodeURIComponent(selected.reference)}`, 'PUT', body);
      replaceRow(updated);
      setSelected(updated);
      setPanelOk('Saved.');
    } catch (err) {
      setPanelError(failure(err, 'Could not save the booking.'));
    } finally {
      setPanelBusy(false);
    }
  }

  async function setStatus(b: BookingRow, select: HTMLSelectElement) {
    const status = select.value;
    setError('');
    setSaving(b.reference);
    try {
      const updated = await call<BookingRow>(`/bookings/${encodeURIComponent(b.reference)}/status`, 'PATCH', { status });
      replaceRow(updated);
      if (selected?.reference === updated.reference) setSelected(updated);
    } catch {
      select.value = b.status;
      setError(`Could not update ${b.reference}. Check the admin token and try again.`);
    } finally {
      setSaving('');
    }
  }

  const patchLine = (id: number, patch: Partial<TariffLine>) => setTariff((list) => list.map((l) => (l.vehicle.id === id ? { ...l, ...patch } : l)));

  async function saveRate(line: TariffLine) {
    patchLine(line.vehicle.id, { busy: true, message: '' });
    try {
      const v = await call<VehicleRow>(`/vehicles/${line.vehicle.id}`, 'PATCH', {
        ratePerKm: Number(line.rate), driverAllowance: Number(line.batta), roundTripRatePerKm: Number(line.rtRate), roundTripDriverAllowance: Number(line.rtBatta),
      });
      setTariff((list) => list.map((l) => (l.vehicle.id === v.id ? { ...toLine(v), message: 'Saved.' } : l)));
    } catch (e) {
      patchLine(line.vehicle.id, { busy: false, message: failure(e, 'Could not save.') });
    }
  }

  async function carCall(line: TariffLine, request: () => Promise<VehicleRow>, ok: string) {
    patchLine(line.vehicle.id, { busy: true, message: '' });
    try {
      const v = await request();
      patchLine(line.vehicle.id, { busy: false, vehicle: v, message: ok });
    } catch (e) {
      patchLine(line.vehicle.id, { busy: false, message: failure(e, 'Could not save the photo.') });
    }
  }

  function uploadCar(line: TariffLine, input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD) {
      patchLine(line.vehicle.id, { message: 'Image must be 4 MB or smaller.' });
      input.value = '';
      return;
    }
    const body = new FormData();
    body.append('file', file);
    carCall(line, () => call<VehicleRow>(`/vehicles/${line.vehicle.id}/image`, 'POST', body), 'Photo saved.');
    input.value = '';
  }

  function removeCar(line: TariffLine) {
    if (!confirm(`Remove the photo of ${line.vehicle.name}?`)) return;
    carCall(line, () => call<VehicleRow>(`/vehicles/${line.vehicle.id}/image`, 'DELETE'), 'Photo removed.');
  }

  async function setSwitch(key: 'gstEnabled' | 'placesEnabled' | 'packageEnabled', on: boolean, messages: [string, string], failMsg: string) {
    setSwitchBusy(key);
    setSwitchMsg((m) => ({ ...m, [key]: '' }));
    try {
      const s = await call<Settings>('/settings', 'PUT', { [key]: on });
      setSettings(s);
      setSwitchMsg((m) => ({ ...m, [key]: s[key] ? messages[0] : messages[1] }));
    } catch (e) {
      setSwitchMsg((m) => ({ ...m, [key]: failure(e, failMsg) }));
    } finally {
      setSwitchBusy('');
    }
  }

  async function saveContact() {
    setContactBusy(true);
    setContactMsg('');
    try {
      const s = await call<Settings>('/settings', 'PUT', { supportPhone: contactPhone.trim(), whatsappNumber: contactWhatsapp.replace(/\D/g, '') });
      setSettings(s);
      setContactPhone(s.supportPhone);
      setContactWhatsapp(s.whatsappNumber);
      setContactMsg('Contact numbers saved.');
    } catch (e) {
      setContactMsg(failure(e, 'Could not save the contact numbers.'));
    } finally {
      setContactBusy(false);
    }
  }

  async function openCities() {
    setTab('cities');
    if (cities.length) return;
    try {
      setCities(await call<AdminCity[]>('/cities'));
    } catch (e) {
      setError(failure(e, 'Could not load cities.'));
    }
  }

  function openCity(c: AdminCity) {
    setCityEdit(c);
    setCityForm({ description: c.description ?? '', details: c.details ?? '', spots: c.popularSpots.join('\n') });
    setCityError('');
    setCityOk('');
  }

  /** Runs a city request and swaps the updated city into the list and the open panel. */
  async function cityCall(request: () => Promise<AdminCity>, ok: string, done?: () => void) {
    setCityBusy(true);
    setCityError('');
    setCityOk('');
    try {
      const updated = await request();
      setCities((list) => list.map((x) => (x.slug === updated.slug ? updated : x)));
      setCityEdit(updated);
      setCityOk(ok);
    } catch (e) {
      setCityError(failure(e, 'Something went wrong. Please try again.'));
    } finally {
      setCityBusy(false);
      done?.();
    }
  }

  function saveCity(e: React.FormEvent) {
    e.preventDefault();
    if (!cityEdit) return;
    const popularSpots = cityForm.spots.split('\n').map((s) => s.trim()).filter(Boolean);
    cityCall(() => call<AdminCity>(`/cities/${encodeURIComponent(cityEdit.slug)}`, 'PUT', { description: cityForm.description, details: cityForm.details, popularSpots }), 'Saved.');
  }

  function uploadImage(input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file || !cityEdit) return;
    if (file.size > MAX_UPLOAD) {
      setCityError('Image must be 4 MB or smaller.');
      input.value = '';
      return;
    }
    const body = new FormData();
    body.append('file', file);
    if (uploadCredit.trim()) body.append('credit', uploadCredit.trim());
    if (uploadSource.trim()) body.append('sourceUrl', uploadSource.trim());
    cityCall(() => call<AdminCity>(`/cities/${encodeURIComponent(cityEdit.slug)}/images`, 'POST', body), 'Photo added.', () => {
      input.value = '';
      setUploadCredit('');
      setUploadSource('');
    });
  }

  function removeImage(c: AdminCity, img: AdminImage) {
    if (!confirm('Remove this photo?')) return;
    cityCall(() => call<AdminCity>(`/cities/${encodeURIComponent(c.slug)}/images/${img.id}`, 'DELETE'), 'Photo removed.');
  }

  const setF = (key: string, value: unknown) => setForm((f) => (f ? { ...f, [key]: value } : f));

  if (!connected) {
    return (
      <>
        <h1>Admin</h1>
        <form className="card" onSubmit={connect}>
          <label htmlFor="token">Admin token</label>
          <input id="token" name="token" type="password" autoComplete="off" required value={token} onChange={(e) => setToken(e.target.value)} />
          <button className="btn" type="submit" disabled={busy || !token}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <button className="btn" type="button" disabled={busy || !token} onClick={setupDatabase}>Set up database (first time only)</button>
          <p className="note">Run this once on a new site, before signing in. It only fills empty tables and never overwrites existing data.</p>
          {setupMsg && <p className="note" role="status">{setupMsg}</p>}
          {error && <p className="error" role="alert">{error}</p>}
        </form>
      </>
    );
  }

  const switchCard = (key: 'gstEnabled' | 'placesEnabled' | 'packageEnabled', title: string, note: string, messages: [string, string], failMsg: string) => (
    <section className="card gst-switch">
      <label className="choice">
        <input type="checkbox" checked={!!settings?.[key]} disabled={switchBusy === key || !settings} onChange={(e) => setSwitch(key, e.target.checked, messages, failMsg)} />
        <strong>{title}</strong>
      </label>
      <p className="note">{note}</p>
      {switchMsg[key] && <p className="note" role="status">{switchMsg[key]}</p>}
    </section>
  );

  return (
    <>
      <h1>Admin</h1>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" className={`tab${tab === 'bookings' ? ' active' : ''}`} onClick={() => setTab('bookings')}>Bookings</button>
        <button type="button" role="tab" className={`tab${tab === 'tariff' ? ' active' : ''}`} onClick={() => setTab('tariff')}>Tariff</button>
        <button type="button" role="tab" className={`tab${tab === 'cities' ? ' active' : ''}`} onClick={openCities}>Cities</button>
        <button type="button" className="tab signout" onClick={signOut}>Sign out</button>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {tab === 'bookings' && (
        <>
          <form className="card" onSubmit={(e) => { e.preventDefault(); loadBookings(); }}>
            <label htmlFor="q">Search</label>
            <input id="q" name="q" type="search" placeholder="Reference, name, mobile or email" maxLength={100} value={query} onChange={(e) => setQuery(e.target.value)} />
            <label htmlFor="statusFilter">Status</label>
            <select id="statusFilter" name="statusFilter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {BOOKING_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Loading…' : 'Search'}</button>
            <button className="btn secondary" type="button" disabled={busy} onClick={clear}>Clear</button>
          </form>

          {form && selected && (
            <form className="card details" onSubmit={saveBooking}>
              <h2>Booking {selected.reference}</h2>
              <p className="note">Booked {selected.createdAt} · Status {selected.status}</p>
              <div className="two-col">
                <div>
                  <label htmlFor="e-from">From</label>
                  <select id="e-from" value={form.fromSlug} onChange={(e) => setF('fromSlug', e.target.value)}>
                    <option value="">Keep current ({selected.from})</option>
                    {routeCities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="e-to">To</label>
                  <select id="e-to" value={form.toSlug} onChange={(e) => setF('toSlug', e.target.value)}>
                    <option value="">Keep current ({selected.to})</option>
                    {routeCities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="e-trip">Trip type</label>
                  <select id="e-trip" value={form.tripType} onChange={(e) => setF('tripType', e.target.value)}>
                    <option value="ONE_WAY">One way</option>
                    <option value="ROUND_TRIP">Round trip</option>
                    <option value="PACKAGE">Package</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="e-vehicle">Vehicle</label>
                  <select id="e-vehicle" value={form.vehicleId} onChange={(e) => setF('vehicleId', Number(e.target.value))}>
                    {tariff.map((t) => <option key={t.vehicle.id} value={t.vehicle.id}>{t.vehicle.name} ({t.vehicle.seats} seats)</option>)}
                  </select>
                </div>
              </div>

              <label htmlFor="e-name">Customer name</label>
              <input id="e-name" required maxLength={100} value={form.customerName} onChange={(e) => setF('customerName', e.target.value)} />

              <div className="two-col">
                <div>
                  <label htmlFor="e-mobile">Mobile</label>
                  <input id="e-mobile" required maxLength={10} pattern="[6-9][0-9]{9}" value={form.mobile} onChange={(e) => setF('mobile', e.target.value)} />
                </div>
                <div>
                  <label htmlFor="e-email">Email</label>
                  <input id="e-email" type="email" maxLength={150} value={form.email} onChange={(e) => setF('email', e.target.value)} />
                </div>
                <div>
                  <label htmlFor="e-date">Pickup date</label>
                  <input id="e-date" type="date" required value={form.pickupDate} onChange={(e) => setF('pickupDate', e.target.value)} />
                </div>
                <div>
                  <label htmlFor="e-time">Pickup time</label>
                  <input id="e-time" type="time" required value={form.pickupTime} onChange={(e) => setF('pickupTime', e.target.value)} />
                </div>
                {form.tripType === 'ROUND_TRIP' && (
                  <div>
                    <label htmlFor="e-return">Return date</label>
                    <input id="e-return" type="date" required min={form.pickupDate} value={form.returnDate ?? ''} onChange={(e) => setF('returnDate', e.target.value)} />
                  </div>
                )}
                {form.tripType === 'PACKAGE' && (
                  <div>
                    <label htmlFor="e-package">Package</label>
                    <select id="e-package" value={form.packageHours ?? ''} onChange={(e) => setF('packageHours', Number(e.target.value))}>
                      {packages.map((p) => <option key={p.hours} value={p.hours}>{p.hours} hrs / {p.km} km</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label htmlFor="e-pax">Passengers</label>
                  <input id="e-pax" type="number" min={1} max={12} required value={form.passengers} onChange={(e) => setF('passengers', e.target.value)} />
                </div>
                <div>
                  <label htmlFor="e-bags">Luggage (bags)</label>
                  <input id="e-bags" type="number" min={0} max={20} required value={form.luggage} onChange={(e) => setF('luggage', e.target.value)} />
                </div>
              </div>

              <label htmlFor="e-address">Pickup address</label>
              <input id="e-address" required maxLength={300} value={form.pickupAddress} onChange={(e) => setF('pickupAddress', e.target.value)} />
              <label htmlFor="e-notes">Notes</label>
              <input id="e-notes" maxLength={500} value={form.notes} onChange={(e) => setF('notes', e.target.value)} />
              <label htmlFor="e-total">Total amount (₹)</label>
              <input id="e-total" type="number" min={0} step="0.01" required value={form.total} onChange={(e) => setF('total', e.target.value)} />
              <p className="note">The total is not recalculated when you change the route or vehicle. Enter the amount to charge.</p>

              {panelError && <p className="error" role="alert">{panelError}</p>}
              {panelOk && <p className="ok" role="status">{panelOk}</p>}
              <button className="btn" type="submit" disabled={panelBusy}>{panelBusy ? 'Saving…' : 'Save changes'}</button>
              <button className="btn secondary" type="button" onClick={closeDetails}>Close</button>
            </form>
          )}

          {rows && (
            <>
              <p className="note">{rows.length} booking(s), newest first{rows.length === 200 ? ' (showing the latest 200; narrow your search)' : ''}.</p>
              <div className="table-scroll">
                <table className="admin-table">
                  <thead>
                    <tr><th>S.No</th><th>Customer name</th><th>From</th><th>To</th><th>Trip type</th><th>Total amount</th><th>Status</th><th></th></tr>
                  </thead>
                  <tbody>
                    {rows.map((b, i) => (
                      <tr key={b.reference} className={selected?.reference === b.reference ? 'selected' : undefined}>
                        <td>{i + 1}</td>
                        <td>{b.customerName}<br /><span className="note">{b.reference} · {b.mobile}</span></td>
                        <td>{b.from}</td>
                        <td>{b.to}</td>
                        <td>{tripLabel(b.tripType)}</td>
                        <td className="price">{inr(b.total, 0, 2)}</td>
                        <td>
                          <select className="status-select" aria-label={`Status for ${b.reference}`} value={b.status} disabled={saving === b.reference} onChange={(e) => setStatus(b, e.target)}>
                            {BOOKING_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td><button className="btn secondary small" type="button" onClick={() => openDetails(b)}>Details</button></td>
                      </tr>
                    ))}
                    {rows.length === 0 && <tr><td colSpan={8}>No bookings found.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'tariff' && (
        <>
          <h2>Vehicles and tariff</h2>
          {switchCard('gstEnabled', 'Charge GST',
            `${settings?.gstEnabled ? 'GST is on: it is added to every new quote and booking.' : 'GST is off: no GST is added or shown anywhere on the site.'} You can switch it at any time. Saved bookings keep their total.`,
            ['GST turned on.', 'GST turned off.'], 'Could not change the GST setting.')}
          {switchCard('placesEnabled', 'Use Google place search',
            settings?.placesEnabled ? 'On: the home page uses Google place search (needs a working Google key and quota).'
              : 'Off: the home page uses the city dropdowns (Tamil Nadu, Pondicherry and Bangalore). Distances without a stored route are estimated.',
            ['Google place search turned on.', 'City dropdowns turned on.'], 'Could not change the search setting.')}
          {switchCard('packageEnabled', 'Package trips available',
            settings?.packageEnabled ? 'On: customers can get fares and book package trips.'
              : 'Off: the Package tab shows "Sorry for the inconvenience, for now this service is not available." and package bookings are refused.',
            ['Package trips turned on.', 'Package trips turned off.'], 'Could not change the package setting.')}
          <section className="card gst-switch">
            <strong>Contact numbers</strong>
            <p className="note">Shown in the site header, footer, contact page and the floating call and WhatsApp buttons. Changes appear on the site at once.</p>
            <div className="two-col">
              <div className="field">
                <label htmlFor="contact-phone">Phone number</label>
                <input id="contact-phone" type="tel" maxLength={20} placeholder="+91 98765 43210" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="contact-wa">WhatsApp number (country code, digits only)</label>
                <input id="contact-wa" type="tel" maxLength={15} placeholder="919876543210" value={contactWhatsapp} onChange={(e) => setContactWhatsapp(e.target.value)} />
              </div>
            </div>
            <button className="btn small" type="button" disabled={contactBusy} onClick={saveContact}>Save contact numbers</button>
            {contactMsg && <p className="note" role="status">{contactMsg}</p>}
          </section>
          <p className="note">
            Changes apply immediately to the fares shown on the site and to new bookings. Existing bookings keep their saved total.
            Each vehicle has its own drop-trip and round-trip rate per km and driver batta (per day). Minimum km and the GST rate are set in the code (src/lib/config.ts).
            The car photo appears on the fare cards (JPEG, PNG or WebP, up to 4 MB).
          </p>
          <div className="table-scroll">
            <table className="admin-table">
              <thead><tr><th>Photo</th><th>Vehicle</th><th>Seats</th><th>Drop rate/km (₹)</th><th>Drop batta (₹/day)</th><th>Round trip rate/km (₹)</th><th>Round trip batta (₹/day)</th><th></th></tr></thead>
              <tbody>
                {tariff.map((t) => (
                  <tr key={t.vehicle.id}>
                    <td className="photo-cell">
                      {t.vehicle.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="car-thumb" src={vehicleImageUrl(t.vehicle.image)} alt={t.vehicle.name} />
                      ) : <span className="note">No photo</span>}
                      <label className="btn small secondary file-btn">
                        {t.vehicle.image ? 'Change' : 'Upload'}
                        <input type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label={`Car photo for ${t.vehicle.name}`} onChange={(e) => uploadCar(t, e.target)} />
                      </label>
                      {t.vehicle.image && <button className="btn small secondary" type="button" onClick={() => removeCar(t)}>Remove</button>}
                    </td>
                    <td>{t.vehicle.name}{!t.vehicle.active && <span className="note"> (inactive)</span>}</td>
                    <td>{t.vehicle.seats}+1</td>
                    <td><input className="rate-input" type="number" min="0.01" max="9999.99" step="0.01" aria-label={`Rate per km for ${t.vehicle.name}`} value={t.rate} onChange={(e) => patchLine(t.vehicle.id, { rate: e.target.value })} /></td>
                    <td><input className="rate-input" type="number" min="0" max="99999.99" step="1" aria-label={`Driver batta for ${t.vehicle.name}`} value={t.batta} onChange={(e) => patchLine(t.vehicle.id, { batta: e.target.value })} /></td>
                    <td><input className="rate-input" type="number" min="0.01" max="9999.99" step="0.01" aria-label={`Round trip rate per km for ${t.vehicle.name}`} value={t.rtRate} onChange={(e) => patchLine(t.vehicle.id, { rtRate: e.target.value })} /></td>
                    <td><input className="rate-input" type="number" min="0" max="99999.99" step="1" aria-label={`Round trip driver batta for ${t.vehicle.name}`} value={t.rtBatta} onChange={(e) => patchLine(t.vehicle.id, { rtBatta: e.target.value })} /></td>
                    <td>
                      <button className="btn small" type="button" disabled={t.busy || !t.rate || t.batta === '' || !t.rtRate || t.rtBatta === ''} onClick={() => saveRate(t)}>{t.busy ? 'Saving…' : 'Save'}</button>
                      {t.message && <span className="note"> {t.message}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'cities' && (
        <>
          <h2>Cities</h2>
          <p className="note">Add up to 3 photos per city. They appear on the city card and the city page, and change every 7.5 seconds. A city with no photos shows a generated banner.</p>
          <div className="table-scroll">
            <table className="admin-table">
              <thead><tr><th>City</th><th>State</th><th>Photos</th><th></th></tr></thead>
              <tbody>
                {cities.map((c) => (
                  <tr key={c.slug} className={cityEdit?.slug === c.slug ? 'selected' : undefined}>
                    <td>{c.name}</td>
                    <td>{c.state}</td>
                    <td>{c.images.length} of 3</td>
                    <td><button className="btn secondary small" type="button" onClick={() => openCity(c)}>Edit</button></td>
                  </tr>
                ))}
                {cities.length === 0 && <tr><td colSpan={4}>No cities loaded.</td></tr>}
              </tbody>
            </table>
          </div>

          {cityEdit && (
            <form className="card details" onSubmit={saveCity}>
              <h2>{cityEdit.name}, {cityEdit.state}</h2>
              <h3>Photos ({cityEdit.images.length} of 3)</h3>
              <div className="photo-row">
                {cityEdit.images.map((img) => (
                  <figure className="photo" key={img.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cityImageUrl(img.fileName)} alt={`${cityEdit.name} photo`} />
                    {img.credit && <figcaption className="note">{img.credit}</figcaption>}
                    <button className="btn secondary small" type="button" disabled={cityBusy} onClick={() => removeImage(cityEdit, img)}>Remove</button>
                  </figure>
                ))}
              </div>
              {cityEdit.images.length < 3 ? (
                <>
                  <label htmlFor="c-credit">Photo credit (optional, fill in before choosing the file)</label>
                  <input id="c-credit" maxLength={300} placeholder="Photographer, licence" value={uploadCredit} onChange={(e) => setUploadCredit(e.target.value)} />
                  <label htmlFor="c-source">Source link (optional, https://)</label>
                  <input id="c-source" type="url" maxLength={300} placeholder="https://" value={uploadSource} onChange={(e) => setUploadSource(e.target.value)} />
                  <label htmlFor="c-file">Add a photo</label>
                  <input id="c-file" type="file" accept="image/jpeg,image/png,image/webp" disabled={cityBusy} onChange={(e) => uploadImage(e.target)} />
                  <p className="note">JPEG, PNG or WebP, up to 4 MB. Wide photos work best. Only upload photos you own or that are openly licensed, and credit them if the licence requires it.</p>
                </>
              ) : <p className="note">This city has 3 photos. Remove one to add another.</p>}

              <label htmlFor="c-desc">Short description (shown on the card)</label>
              <textarea id="c-desc" rows={3} maxLength={500} value={cityForm.description} onChange={(e) => setCityForm({ ...cityForm, description: e.target.value })} />
              <label htmlFor="c-details">Details (shown on the city page)</label>
              <textarea id="c-details" rows={6} maxLength={2000} value={cityForm.details} onChange={(e) => setCityForm({ ...cityForm, details: e.target.value })} />
              <label htmlFor="c-spots">Popular spots (one per line, up to 8)</label>
              <textarea id="c-spots" rows={5} value={cityForm.spots} onChange={(e) => setCityForm({ ...cityForm, spots: e.target.value })} />

              {cityError && <p className="error" role="alert">{cityError}</p>}
              {cityOk && <p className="ok" role="status">{cityOk}</p>}
              <button className="btn" type="submit" disabled={cityBusy}>{cityBusy ? 'Working…' : 'Save changes'}</button>
              <button className="btn secondary" type="button" onClick={() => setCityEdit(null)}>Close</button>
            </form>
          )}
        </>
      )}
    </>
  );
}
