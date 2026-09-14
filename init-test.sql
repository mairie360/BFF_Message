-- Seed minimal pour les tests isolés (performance / sécurité) du BFF Message.
-- L'utilisateur 2 est celui référencé par les JWT de test (claim sub = "2") :
--   * load-test.js le signe dynamiquement,
--   * docker-compose-security.yml injecte un token statique via le replacer ZAP.
-- L'utilisateur 3 existe pour que /contacts (lecture directe de la table users,
-- excluant l'appelant) renvoie au moins une entrée.

INSERT INTO users (id, first_name, last_name, email, password, status)
VALUES
  (2, 'Perf', 'Tester', 'perf-tester@mairie360.fr', 'dummy', 'active'),
  (3, 'Contact', 'Sample', 'contact-sample@mairie360.fr', 'dummy', 'active')
ON CONFLICT (id) DO NOTHING;

-- Core API >= 1.1.1 exige au moins un rôle sur l'utilisateur pour GET /user/me
-- (sinon panic "index out of bounds" côté Core). Le rôle "User" ne donne pas
-- l'accès admin.
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u CROSS JOIN roles r
WHERE u.id IN (2, 3) AND lower(r.name) = 'user'
ON CONFLICT DO NOTHING;
