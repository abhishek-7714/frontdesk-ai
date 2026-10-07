-- Doctor-side actions from Claude: block a day, leave the front desk a note.

CREATE TABLE IF NOT EXISTS day_blocks (
  id serial PRIMARY KEY,
  doctor_id int NOT NULL REFERENCES doctors(id),
  day date NOT NULL,
  reason text,
  -- Slots this block closed, so reopening (or a demo reset) restores exactly those.
  slot_ids int[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doctor_id, day)
);

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS needs_reschedule boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS desk_notes (
  id serial PRIMARY KEY,
  doctor_id int REFERENCES doctors(id),
  kind text NOT NULL CHECK (kind IN ('note', 'day_blocked', 'day_reopened')),
  message text NOT NULL,
  urgency text NOT NULL DEFAULT 'routine' CHECK (urgency IN ('routine', 'urgent')),
  details jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS desk_notes_open_idx ON desk_notes (status, created_at DESC);
