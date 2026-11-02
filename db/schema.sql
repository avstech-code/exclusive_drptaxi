-- Postgres schema for droptaxi (Neon / Vercel Postgres, or PGlite locally).
-- Safe to run more than once: every statement is IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS cities (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    slug        VARCHAR(100) NOT NULL UNIQUE,
    state       VARCHAR(50)  NOT NULL,
    district    VARCHAR(100),
    latitude    NUMERIC(9,6) NOT NULL,
    longitude   NUMERIC(9,6) NOT NULL,
    is_hub      BOOLEAN NOT NULL DEFAULT FALSE,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    description VARCHAR(500),
    popular_spots JSONB,
    details     TEXT
);

-- Up to 3 photos per city. file_name is either a bundled file name (public/media/cities) or a full Blob URL.
CREATE TABLE IF NOT EXISTS city_images (
    id         SERIAL PRIMARY KEY,
    city_id    INT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
    file_name  VARCHAR(400) NOT NULL UNIQUE,
    sort_order SMALLINT NOT NULL DEFAULT 0,
    credit     VARCHAR(300),
    source_url VARCHAR(300),
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_city_images_city ON city_images (city_id, sort_order);

CREATE TABLE IF NOT EXISTS vehicle_types (
    id          SMALLSERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL,
    seats       SMALLINT NOT NULL,
    rate_per_km NUMERIC(6,2) NOT NULL,
    driver_allowance NUMERIC(8,2) NOT NULL DEFAULT 300,
    round_trip_rate_per_km NUMERIC(6,2) NOT NULL,
    round_trip_driver_allowance NUMERIC(8,2) NOT NULL,
    image_file  VARCHAR(400),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

-- One row per direction: Chennai->Coimbatore and Coimbatore->Chennai are separate rows
CREATE TABLE IF NOT EXISTS routes (
    id               SERIAL PRIMARY KEY,
    from_city_id     INT NOT NULL REFERENCES cities(id),
    to_city_id       INT NOT NULL REFERENCES cities(id),
    slug             VARCHAR(200) NOT NULL UNIQUE,
    distance_km      NUMERIC(7,1) NOT NULL,
    duration_minutes INT NOT NULL,
    highway          VARCHAR(200),
    toll_plazas      SMALLINT NOT NULL DEFAULT 0,
    toll_total       NUMERIC(8,2) NOT NULL DEFAULT 0,
    permit_fee       NUMERIC(8,2) NOT NULL DEFAULT 0,
    summary_text     TEXT,
    is_indexable     BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at       TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (from_city_id, to_city_id),
    CHECK (from_city_id <> to_city_id)
);

CREATE TABLE IF NOT EXISTS route_faqs (
    id         SERIAL PRIMARY KEY,
    route_id   INT NULL REFERENCES routes(id) ON DELETE CASCADE,   -- NULL = shared FAQ
    question   TEXT NOT NULL,
    answer     TEXT NOT NULL,
    sort_order SMALLINT NOT NULL DEFAULT 0
);

-- Customer bookings of every trip type. The total is always computed on the server.
CREATE TABLE IF NOT EXISTS bookings (
    id              SERIAL PRIMARY KEY,
    reference       VARCHAR(20) NOT NULL UNIQUE,
    trip_type       VARCHAR(12) NOT NULL DEFAULT 'ONE_WAY',          -- ONE_WAY, ROUND_TRIP, PACKAGE
    route_id        INT NULL REFERENCES routes(id),
    from_label      VARCHAR(200),
    to_label        VARCHAR(200),
    from_place_id   VARCHAR(200),
    to_place_id     VARCHAR(200),
    distance_km     NUMERIC(7,1),
    vehicle_type_id SMALLINT NOT NULL REFERENCES vehicle_types(id),
    customer_name   VARCHAR(100) NOT NULL,
    mobile          VARCHAR(15) NOT NULL,
    email           VARCHAR(150),
    pickup_date     DATE NOT NULL,
    pickup_time     TIME NOT NULL,
    return_date     DATE NULL,                                       -- round trips
    package_hours   INT NULL,                                        -- packages
    package_km      INT NULL,
    passengers      INT NOT NULL DEFAULT 1,
    luggage         INT NOT NULL DEFAULT 0,
    pickup_address  VARCHAR(300) NOT NULL,
    notes           VARCHAR(500),
    total_amount    NUMERIC(10,2) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bookings_mobile ON bookings (mobile);
CREATE INDEX IF NOT EXISTS idx_bookings_created ON bookings (created_at DESC);

-- Switches stored here (change them in the database; gst_enabled, package_enabled, places_enabled, support_phone, whatsapp_number)
CREATE TABLE IF NOT EXISTS app_settings (
    setting_key   VARCHAR(50) PRIMARY KEY,
    setting_value VARCHAR(200) NOT NULL
);
