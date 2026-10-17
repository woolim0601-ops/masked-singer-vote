-- 행사 최초 설치 시 한 번만 실행하세요. 이미 투표가 시작된 뒤 재초기화하지 마세요.
CREATE TABLE IF NOT EXISTS rounds (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','open','closed','revealed')),
  started_at_ms INTEGER,
  ends_at_ms INTEGER,
  a_votes INTEGER,
  b_votes INTEGER
);
CREATE TABLE IF NOT EXISTS event_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  current_round_id INTEGER NOT NULL REFERENCES rounds(id)
);
CREATE TABLE IF NOT EXISTS votes (
  round_id INTEGER NOT NULL REFERENCES rounds(id),
  voter_id TEXT NOT NULL,
  choice TEXT NOT NULL CHECK(choice IN ('A','B')),
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (round_id, voter_id)
);
CREATE INDEX IF NOT EXISTS votes_round_choice ON votes(round_id, choice);
INSERT OR IGNORE INTO rounds(id,title,option_a,option_b) VALUES
(1,'1라운드','A 참가자','B 참가자'),
(2,'2라운드','A 참가자','B 참가자'),
(3,'3라운드','A 참가자','B 참가자'),
(4,'결승','A 참가자','B 참가자');
INSERT OR IGNORE INTO event_state(id,current_round_id) VALUES(1,1);
