-- Minimal seed for the isolated test stacks (performance / security) of BFF Message.
-- The test JWTs reference two users:
--   * sub = "1": Admin role. docker-compose-security.yml injects a static token for it
--     through the ZAP replacer, so every operation is scanned authenticated;
--   * sub = "2": User role only. load-test.js signs a token for it on the fly.
-- User 3 exists so that /contacts (every user but the caller) returns at least one entry.

INSERT INTO users (id, first_name, last_name, email, password, status)
VALUES
    (1, 'Security', 'Admin', 'security-admin@mairie360.fr', 'dummy', 'active'),
    (2, 'Perf', 'Tester', 'perf-tester@mairie360.fr', 'dummy', 'active'),
    (3, 'Contact', 'Sample', 'contact-sample@mairie360.fr', 'dummy', 'active'),
    (10, 'Scan', 'Recipient', 'scan-recipient@mairie360.fr', 'dummy', 'active')
ON CONFLICT (id) DO NOTHING;

-- Core API >= 1.1.1 requires at least one role on the user for GET /user/me.
-- Core returns a single role: user 1 must only hold Admin.
DELETE FROM user_roles
WHERE user_id = 1 AND role_id <> (SELECT id FROM roles WHERE lower(name) = 'admin');

INSERT INTO user_roles (user_id, role_id)
SELECT 1, r.id FROM roles r WHERE lower(r.name) = 'admin'
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM roles r CROSS JOIN (VALUES (2), (3), (10)) AS u(id) WHERE lower(r.name) = 'user'
ON CONFLICT DO NOTHING;

-- Scan fixtures: ZAP fills ids with the contract examples, so conversation 101 (members 1 and 3,
-- message 1001) is read and marked as read, conversation 201 receives the posted messages (the reads
-- of 101 stay stable), conversation 102 is the example of DELETE /conversations/{conversationId}, and user 3 is the example member. ZAP ignores the example of a
-- top-level id that accepts a string or a number and sends 10: user 10 is the direct-message recipient.
INSERT INTO conversations (id, title, kind)
VALUES
    (101, 'Scan conversation', 'group'),
    (102, 'Scan deleted conversation', 'group'),
    (201, 'Scan written conversation', 'group')
ON CONFLICT (id) DO NOTHING;

INSERT INTO conversation_members (conversation_id, user_id)
VALUES (101, 1), (101, 3), (102, 1), (102, 3), (201, 1), (201, 3)
ON CONFLICT DO NOTHING;

INSERT INTO messages (id, conversation_id, owner_id, content)
VALUES (1001, 101, 3, 'Message read by the ZAP scan')
ON CONFLICT (id) DO NOTHING;

-- Explicit ids do not advance the sequences: move them past the seeded rows so that the
-- rows created during the tests (users, conversations, messages) do not collide.
SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT max(id) FROM users));
SELECT setval(pg_get_serial_sequence('conversations', 'id'), (SELECT max(id) FROM conversations));
SELECT setval(pg_get_serial_sequence('messages', 'id'), (SELECT max(id) FROM messages));
