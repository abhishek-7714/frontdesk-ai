CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS doctors (
  id serial PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  specialty text NOT NULL,
  bio text NOT NULL,
  consult_fee_inr int NOT NULL,
  slot_minutes int NOT NULL DEFAULT 30
);

CREATE TABLE IF NOT EXISTS patients (
  id serial PRIMARY KEY,
  name text NOT NULL,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_seed boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS slots (
  id serial PRIMARY KEY,
  doctor_id int NOT NULL REFERENCES doctors(id),
  starts_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','booked','blocked')),
  UNIQUE (doctor_id, starts_at)
);

CREATE TABLE IF NOT EXISTS calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  status text NOT NULL DEFAULT 'live' CHECK (status IN ('live','ended')),
  patient_id int REFERENCES patients(id),
  summary text,
  summary_input_tokens int,
  summary_output_tokens int,
  eleven_conversation_id text
);

CREATE TABLE IF NOT EXISTS appointments (
  id serial PRIMARY KEY,
  slot_id int UNIQUE NOT NULL REFERENCES slots(id),
  doctor_id int NOT NULL REFERENCES doctors(id),
  patient_id int NOT NULL REFERENCES patients(id),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','cancelled')),
  source text NOT NULL CHECK (source IN ('voice_agent','seed')),
  call_id uuid REFERENCES calls(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS intakes (
  id serial PRIMARY KEY,
  call_id uuid REFERENCES calls(id),
  appointment_id int REFERENCES appointments(id),
  chief_complaint text NOT NULL,
  duration text,
  severity text,
  current_medications text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS escalations (
  id serial PRIMARY KEY,
  call_id uuid REFERENCES calls(id),
  reason text NOT NULL,
  urgency text NOT NULL CHECK (urgency IN ('routine','urgent','emergency')),
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transcript_lines (
  id bigserial PRIMARY KEY,
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('patient','agent')),
  text text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS call_events (
  id bigserial PRIMARY KEY,
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policy_chunks (
  id serial PRIMARY KEY,
  doc_slug text NOT NULL,
  doc_title text NOT NULL,
  section text NOT NULL,
  content text NOT NULL,
  embedding vector(1536),
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', doc_title || ' ' || section || ' ' || content)) STORED
);

CREATE INDEX IF NOT EXISTS policy_chunks_embedding_idx ON policy_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS policy_chunks_tsv_idx ON policy_chunks USING gin (tsv);
CREATE INDEX IF NOT EXISTS slots_doctor_starts_idx ON slots (doctor_id, starts_at);
CREATE INDEX IF NOT EXISTS call_events_call_idx ON call_events (call_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS intakes_call_uidx ON intakes (call_id) WHERE call_id IS NOT NULL;
