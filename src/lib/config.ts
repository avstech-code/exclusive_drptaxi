// Fare settings that used to live in application.yml. Staff-editable switches are in the app_settings table.
export const fareConfig = {
  minKm: 130, // minimum billable km per one-way trip
  gstRate: 0.05, // applied only while the GST switch is on
  roundTripMinKmPerDay: 250,
  packageHourRate: 150, // rupees per package hour, on top of package km x vehicle rate
  packages: [
    { hours: 4, km: 40 },
    { hours: 8, km: 80 },
    { hours: 12, km: 120 },
  ],
  roadDistanceFactor: 1.25, // estimated road km = straight-line km x this
  averageSpeedKmph: 45,
};

export const CITY_MATCH_KM = 15;
export const MAX_KM = 2500;
export const MIN_KM = 0.5;
export const MAX_ROUND_TRIP_DAYS = 30;
export const PACKAGE_OFF_MESSAGE = 'Sorry for the inconvenience, for now this service is not available.';

export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
export const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'exclusivedroptaxi@gmail.com';
export const businessAddress = process.env.NEXT_PUBLIC_BUSINESS_ADDRESS || '1A, 3rd. Cross Street, Kannappan Nagar, Thiruvanmiyur, Chennai - 600041, Tamil Nadu.';
export const SITE_NAME = 'droptaxi.com';
