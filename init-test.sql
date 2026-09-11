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
