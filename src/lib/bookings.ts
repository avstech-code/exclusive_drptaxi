import 'server-only';
import { randomInt } from 'node:crypto';
import { after } from 'next/server';
import { sendBookingNotifications } from './notify';
import { ApiError } from './http';
import { query, one } from './db';
import { quote, findPackage } from './fare';
import { citiesOfRouteSlug, cheapestVehicleAndGst, routeBySlug, routeByCities, vehicleById } from './catalog';
import { resolveCities, resolvePlaces, type TripInfo } from './trips';
import { BOOKING_STATUSES, type BookingRequest, type BookingResponse, type TripKind } from './types';

const REF_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MOBILE = /^[6-9][0-9]{9}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const nonBlank = (s: unknown): s is string => typeof s === 'string' && s.trim() !== '';
const blankToNull = (s: unknown): string | null => (nonBlank(s) ? s.trim() : null);
const todayIst = (): string => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

function bad(message: string): never {
  throw new ApiError(400, message);
}

/** Fields shared by a customer booking and a staff edit; throws a 400 with a readable message on the first problem. */
interface Common {
  customerName: string; mobile: string; email: string | null; pickupDate: string; pickupTime: string;
  passengers: number; luggage: number; pickupAddress: string; notes: string | null;
}

function validateCommon(b: Record<string, unknown>, opts: { futureOnly: boolean }): Common {
  const name = typeof b.customerName === 'string' ? b.customerName.trim() : '';
  if (!name || name.length > 100) bad('customerName must be filled in (up to 100 characters)');
  if (typeof b.mobile !== 'string' || !MOBILE.test(b.mobile)) bad('mobile must be a 10 digit Indian mobile number');
  const email = blankToNull(b.email);
  if (email && (email.length > 150 || !EMAIL.test(email))) bad('email must be a valid email address');
  if (typeof b.pickupDate !== 'string' || !DATE.test(b.pickupDate) || Number.isNaN(Date.parse(b.pickupDate))) bad('pickupDate must be a valid date');
  if (opts.futureOnly && b.pickupDate < todayIst()) bad('pickupDate must not be in the past');
  if (typeof b.pickupTime !== 'string' || !TIME.test(b.pickupTime)) bad('pickupTime must be a valid time');
  const passengers = Number(b.passengers);
  if (!Number.isInteger(passengers) || passengers < 1 || passengers > 12) bad('passengers must be between 1 and 12');
  const luggage = Number(b.luggage ?? 0);
  if (!Number.isInteger(luggage) || luggage < 0 || luggage > 20) bad('luggage must be between 0 and 20');
  const address = typeof b.pickupAddress === 'string' ? b.pickupAddress.trim() : '';
  if (!address || address.length > 300) bad('pickupAddress must be filled in (up to 300 characters)');
  const notes = blankToNull(b.notes);
  if (notes && notes.length > 500) bad('notes must be at most 500 characters');
  return { customerName: name, mobile: b.mobile as string, email, pickupDate: b.pickupDate as string, pickupTime: (b.pickupTime as string).slice(0, 5), passengers, luggage, pickupAddress: address, notes };
}

function newReference(): string {
  let s = 'DT';
  for (let i = 0; i < 8; i++) s += REF_CHARS[randomInt(REF_CHARS.length)];
  return s;
}

/** True when the request names Google places or dropdown cities rather than a stored route. */
export const usesPlaces = (r: Partial<BookingRequest>): boolean =>
  nonBlank(r.fromPlaceId) || nonBlank(r.toPlaceId) || nonBlank(r.fromCitySlug) || nonBlank(r.toCitySlug);

/** The total is always recomputed here; the client never supplies the price. */
export async function createBooking(req: BookingRequest, ip?: string): Promise<BookingResponse> {
  const type: TripKind = req.tripType ?? 'ONE_WAY';
  if (!['ONE_WAY', 'ROUND_TRIP', 'PACKAGE'].includes(type)) bad('Unknown trip type');
  let byRoute = nonBlank(req.routeSlug);
  const byPlaces = nonBlank(req.fromPlaceId) || nonBlank(req.toPlaceId);
  let byCities = nonBlank(req.fromCitySlug) || nonBlank(req.toCitySlug);
  let fromCity = req.fromCitySlug;
  let toCity = req.toCitySlug;
  if (Number(byRoute) + Number(byPlaces) + Number(byCities) !== 1) bad('Choose either a route, a pickup and drop place, or a pickup and drop city');
  if (byRoute && type !== 'ONE_WAY') bad('Round trips and packages are booked from a pickup place');
  const common = validateCommon(req as unknown as Record<string, unknown>, { futureOnly: true });
  if (typeof req.vehicleId !== 'number') bad('vehicleId is required');

  // a route page for a pair with no stored route (e.g. ambur-to-chennai-taxi) is booked as a city to city trip
  const storedRoute = byRoute ? await routeBySlug(req.routeSlug!) : null;
  if (byRoute && !storedRoute) {
    const pair = await citiesOfRouteSlug(req.routeSlug!);
    if (pair) { byRoute = false; byCities = true; fromCity = pair[0].slug; toCity = pair[1].slug; }
  }
  const pickup = byCities ? fromCity : req.fromPlaceId;
  const drop = byCities ? toCity : req.toPlaceId;
  if (!byRoute && type !== 'PACKAGE' && !(nonBlank(pickup) && nonBlank(drop))) bad('Choose both a pickup and a drop');
  if (type === 'PACKAGE' && (!nonBlank(pickup) || nonBlank(drop))) bad('A package needs a pickup only');

  const vehicle = await vehicleById(req.vehicleId);
  if (!vehicle || !vehicle.active) bad('Unknown vehicle');
  if (common.passengers > vehicle!.seats) bad(`This vehicle seats ${vehicle!.seats} passengers`);
  if (type === 'ROUND_TRIP' && (!req.returnDate || !DATE.test(req.returnDate) || req.returnDate < common.pickupDate)) bad('Choose a return date on or after the pickup date');

  let trip: TripInfo;
  let total: number;
  let packageKm: number | null = null;
  if (byRoute) {
    const { gstRate } = await cheapestVehicleAndGst();
    total = quote(Number(storedRoute!.distance_km), vehicle!, gstRate).total;
    trip = { routeId: Number(storedRoute!.id), fromLabel: storedRoute!.from_name, toLabel: storedRoute!.to_name, fromPlaceId: null, toPlaceId: null, distanceKm: Number(storedRoute!.distance_km), durationMinutes: Number(storedRoute!.duration_minutes) };
  } else {
    const spec = { tripType: type, pickupDate: common.pickupDate, returnDate: req.returnDate, packageHours: req.packageHours };
    const resolved = byCities ? await resolveCities(fromCity!, toCity, spec) : await resolvePlaces(req.fromPlaceId!, req.toPlaceId, null, spec);
    const q = resolved.quote.quotes.find((x) => x.vehicleId === vehicle!.id);
    if (!q) bad('Unknown vehicle');
    total = q!.total;
    trip = resolved.trip;
    packageKm = resolved.quote.packageKm;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const ref = newReference();
    const rows = await query<{ reference: string; status: string }>(
      `INSERT INTO bookings (reference, trip_type, route_id, from_label, to_label, from_place_id, to_place_id, distance_km, vehicle_type_id,
         customer_name, mobile, email, pickup_date, pickup_time, return_date, package_hours, package_km, passengers, luggage, pickup_address, notes, total_amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       ON CONFLICT (reference) DO NOTHING RETURNING reference, status`,
      [ref, type, trip.routeId, trip.fromLabel, trip.toLabel, trip.fromPlaceId, trip.toPlaceId, trip.distanceKm, vehicle!.id,
        common.customerName, common.mobile, common.email, common.pickupDate, common.pickupTime,
        type === 'ROUND_TRIP' ? req.returnDate : null, type === 'PACKAGE' ? req.packageHours : null, type === 'PACKAGE' ? packageKm : null,
        common.passengers, common.luggage, common.pickupAddress, common.notes, total],
    );
    if (rows[0]) {
      // email and WhatsApp the office and the customer after the response has gone out, so the customer never waits for it
      after(() => sendBookingNotifications({
        reference: rows[0].reference, tripType: type, from: trip.fromLabel, to: trip.toLabel, vehicle: vehicle!.name, total,
        customerName: common.customerName, mobile: common.mobile, email: common.email, pickupDate: common.pickupDate, pickupTime: common.pickupTime,
        returnDate: type === 'ROUND_TRIP' ? (req.returnDate ?? null) : null, packageHours: type === 'PACKAGE' ? (req.packageHours ?? null) : null,
        passengers: common.passengers, luggage: common.luggage, pickupAddress: common.pickupAddress, notes: common.notes,
        distanceKm: trip.distanceKm, durationMinutes: trip.durationMinutes ?? null, ip: ip ?? null,
        ratePerKm: type === 'ROUND_TRIP' ? vehicle!.roundTripRatePerKm : vehicle!.ratePerKm,
      }));
      return { reference: rows[0].reference, status: rows[0].status, from: trip.fromLabel, to: trip.toLabel, vehicle: vehicle!.name, total };
    }
  }
  throw new ApiError(500, 'Could not create the booking. Please try again.');
}
