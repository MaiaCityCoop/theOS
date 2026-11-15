-- Who is signed in to the API, the ID tokens already taken, and each person's avatar.

-- A session: the cookie's token, kept only as its SHA-256. sub is the aven.id account; citizen is whether the ID
-- token that opened it had the citizen role (a paid aven.id subscription) at that moment.
CREATE TABLE sessions (
	token_hash text PRIMARY KEY,
	sub uuid NOT NULL,
	name text NOT NULL DEFAULT '',
	citizen boolean NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_expires_at ON sessions (expires_at);

-- An ID token opens one session at most: its SHA-256, kept until it would have expired anyway.
CREATE TABLE used_id_tokens (
	token_hash text PRIMARY KEY,
	expires_at timestamptz NOT NULL
);

-- One avatar per person (API/src/avatar.js says what it holds).
CREATE TABLE avatars (
	sub uuid PRIMARY KEY,
	recipe jsonb NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
