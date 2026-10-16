-- Conversation history, deleted with its conversation
CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES conversations (session_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  -- Unix milliseconds
  timestamp INTEGER NOT NULL
) STRICT;

CREATE INDEX messages_session_id ON messages (session_id, id);

-- One row per model request. Costs outlive the conversation; the message
-- does not.
CREATE TABLE usage (
  id INTEGER PRIMARY KEY,
  timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
  session_id TEXT REFERENCES conversations (session_id) ON DELETE SET NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  input_cost REAL NOT NULL,
  output_cost REAL NOT NULL,
  total_cost REAL NOT NULL,
  -- Only with ENT_LOG_QUERIES=true
  message TEXT
) STRICT;

CREATE INDEX usage_session_id ON usage (session_id);

CREATE TRIGGER usage_forget_message
AFTER UPDATE OF session_id ON usage
WHEN NEW.session_id IS NULL AND NEW.message IS NOT NULL
BEGIN
  UPDATE usage SET message = NULL WHERE id = NEW.id;
END;
