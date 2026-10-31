-- Copied from Message_API (init-perf.sql of its main branch, MAIR-474): keep both in step, and the id ranges
-- at the top of load-test.js. The BFF reads these rows through Message API.
--
-- Volume seed of the performance stack (MAIR-474), run by the `seeder` service after
-- init-test.sql. Without it k6 reads one chat with one message, so the chat lists (OFFSET), the
-- message pages and the unread counters are never measured on a real volume.
--
-- - 2 000 agents (`User`, ids 400001..402000);
-- - 4 000 group chats (ids 100000 + c, c = 0..3999) created by agent 400001 + c % 2000, with the
--   8 members 400001 + (c + 250 * k) % 2000 (k = 0..7): every agent is in 16 chats, and agent
--   400001 + r is a member of chat 100000 + r (k = 0);
-- - 1 000 direct chats (ids 200000 + d) between agents 400001 + d and 401001 + d;
-- - 25 messages in every group chat and 10 000 in chat 100000 (the hot chat, read page by page),
--   written through the database triggers like real posts (unread counters included).
-- load-test.js derives the same ids to read as an agent.
--
-- Fixed ids, ON CONFLICT DO NOTHING / NOT EXISTS: the file is idempotent, like init-test.sql.

INSERT INTO users (id, first_name, last_name, email, password, status, is_archived)
SELECT n, 'Agent', 'Perf ' || n, 'perf.agent.' || n || '@mairie360.fr',
       '$argon2id$v=19$m=19456,t=2,p=1$/iKF9PbiDRDs4EKPjlIIhg$UKx9vfwwps250mEP/bYp63CXbEnQGULeUAhDq+az9Aw',
       'active', FALSE
FROM generate_series(400001, 402000) AS n
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT n, r.id FROM generate_series(400001, 402000) AS n CROSS JOIN roles r WHERE r.name = 'User'
ON CONFLICT DO NOTHING;

INSERT INTO conversations (id, title, kind, created_by, created_at)
SELECT 100000 + c, 'Perf chat ' || c, 'group', 400001 + c % 2000,
       TIMESTAMPTZ '2026-01-01 00:00:00+00' + c * interval '1 hour'
FROM generate_series(0, 3999) AS c
ON CONFLICT (id) DO NOTHING;

INSERT INTO conversation_members (conversation_id, user_id)
SELECT 100000 + c, 400001 + (c + 250 * k) % 2000
FROM generate_series(0, 3999) AS c CROSS JOIN generate_series(0, 7) AS k
ON CONFLICT DO NOTHING;

INSERT INTO conversations (id, kind, created_by, direct_user_low, direct_user_high, created_at)
SELECT 200000 + d, 'direct', 400001 + d, 400001 + d, 401001 + d,
       TIMESTAMPTZ '2026-01-01 00:00:00+00' + d * interval '1 hour'
FROM generate_series(0, 999) AS d
ON CONFLICT (id) DO NOTHING;

INSERT INTO conversation_members (conversation_id, user_id)
SELECT 200000 + d, u
FROM generate_series(0, 999) AS d CROSS JOIN LATERAL (VALUES (400001 + d), (401001 + d)) AS m(u)
ON CONFLICT DO NOTHING;

INSERT INTO messages (conversation_id, owner_id, content, created_at)
SELECT 100000 + c, 400001 + (c + 250 * (m % 8)) % 2000, 'Perf message ' || m,
       TIMESTAMPTZ '2026-01-01 00:00:00+00' + c * interval '1 hour' + m * interval '1 minute'
FROM generate_series(0, 3999) AS c CROSS JOIN generate_series(1, 25) AS m
WHERE NOT EXISTS (SELECT 1 FROM messages WHERE conversation_id = 100001);

INSERT INTO messages (conversation_id, owner_id, content, created_at)
SELECT 100000, 400001 + 250 * (m % 8), 'Perf hot message ' || m,
       TIMESTAMPTZ '2026-02-01 00:00:00+00' + m * interval '1 minute'
FROM generate_series(1, 10000) AS m
WHERE NOT EXISTS (SELECT 1 FROM messages WHERE conversation_id = 100000 AND content = 'Perf hot message 1');

SELECT setval(pg_get_serial_sequence('users', 'id'), GREATEST((SELECT MAX(id) FROM users), 1));
SELECT setval(pg_get_serial_sequence('conversations', 'id'), GREATEST((SELECT MAX(id) FROM conversations), 1));

ANALYZE users;
ANALYZE user_roles;
ANALYZE conversations;
ANALYZE conversation_members;
ANALYZE messages;
ANALYZE unread_counters;
