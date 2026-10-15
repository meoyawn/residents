PRAGMA foreign_keys = ON;

CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE buildings (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  apartments_count INTEGER NOT NULL CHECK (apartments_count > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(collection_id, address)
);
CREATE INDEX buildings_collection ON buildings(collection_id);
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT 'Житель',
  is_webmaster INTEGER NOT NULL DEFAULT 0 CHECK (is_webmaster IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE memberships (
  building_id TEXT NOT NULL REFERENCES buildings(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'resident' CHECK (role IN ('resident','admin')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected')),
  apartment TEXT,
  entrance TEXT,
  verified_by TEXT REFERENCES users(id),
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(building_id,user_id)
);
CREATE INDEX memberships_user ON memberships(user_id,status);
CREATE TABLE collection_admins (
  collection_id TEXT NOT NULL REFERENCES collections(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY(collection_id,user_id)
);
CREATE TABLE otp_challenges (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  delivered INTEGER NOT NULL DEFAULT 0,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX otp_phone ON otp_challenges(phone,created_at);
CREATE TABLE auth_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  csrf_hash TEXT NOT NULL,
  csrf_token TEXT NOT NULL,
  challenge_id TEXT NOT NULL UNIQUE REFERENCES otp_challenges(id),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE problems (
  id TEXT PRIMARY KEY,
  building_id TEXT NOT NULL REFERENCES buildings(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('yard','access','maintenance','safety','other')),
  status TEXT NOT NULL DEFAULT 'discussion' CHECK (status IN ('discussion','open','closed','resolved')),
  created_by TEXT NOT NULL REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1,
  deadline TEXT,
  outcome TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(id,building_id),
  CHECK (status IS NOT 'open' OR deadline IS NOT NULL)
);
CREATE INDEX problems_building_status ON problems(building_id,status,created_at);
CREATE TRIGGER problem_revision_guard BEFORE UPDATE ON problems
WHEN NEW.version IS NOT OLD.version + 1 BEGIN
  SELECT RAISE(ABORT,'Decision changed; reload and retry');
END;
CREATE TABLE options (
  id TEXT PRIMARY KEY,
  problem_id TEXT NOT NULL,
  building_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_kopecks INTEGER NOT NULL CHECK (price_kopecks >= 0),
  cost_note TEXT NOT NULL DEFAULT 'Предварительная смета',
  created_by TEXT NOT NULL REFERENCES users(id),
  FOREIGN KEY(problem_id,building_id) REFERENCES problems(id,building_id),
  UNIQUE(id,problem_id,building_id)
);
CREATE INDEX options_problem ON options(problem_id);
CREATE TABLE votes (
  problem_id TEXT NOT NULL,
  building_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  option_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(problem_id,user_id),
  FOREIGN KEY(problem_id,building_id) REFERENCES problems(id,building_id),
  FOREIGN KEY(option_id,problem_id,building_id) REFERENCES options(id,problem_id,building_id),
  FOREIGN KEY(building_id,user_id) REFERENCES memberships(building_id,user_id)
);
CREATE INDEX votes_building ON votes(building_id);
CREATE TRIGGER vote_insert_guard BEFORE INSERT ON votes BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM problems p JOIN memberships m ON m.building_id IS p.building_id
    WHERE p.id IS NEW.problem_id AND p.building_id IS NEW.building_id
    AND p.status IS 'open' AND p.version IS NEW.version
    AND p.deadline > strftime('%Y-%m-%dT%H:%M:%fZ','now')
    AND m.user_id IS NEW.user_id AND m.status IS 'verified'
  ) THEN RAISE(ABORT,'Voting unavailable') END;
END;
CREATE TRIGGER vote_update_guard BEFORE UPDATE ON votes BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM problems p JOIN memberships m ON m.building_id IS p.building_id
    WHERE p.id IS NEW.problem_id AND p.building_id IS NEW.building_id
    AND p.version IS NEW.version
    AND ((p.status IS 'open' AND p.deadline > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      OR (p.status IN ('closed','resolved') AND NEW.option_id IS OLD.option_id AND NEW.version IS OLD.version + 1))
    AND m.user_id IS NEW.user_id AND m.status IS 'verified'
  ) THEN RAISE(ABORT,'Voting unavailable') END;
END;
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  problem_id TEXT NOT NULL,
  building_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 3000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(problem_id,building_id) REFERENCES problems(id,building_id)
);
CREATE INDEX comments_problem ON comments(problem_id,created_at);
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  building_id TEXT REFERENCES buildings(id),
  actor_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  entity_id TEXT,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX audit_building ON audit_events(building_id,created_at);
CREATE TABLE mcp_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  label TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX mcp_tokens_user ON mcp_tokens(user_id);
CREATE TABLE oauth_clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  redirect_uris TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE oauth_codes (
  code_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  client_id TEXT NOT NULL REFERENCES oauth_clients(id),
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  resource TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);
