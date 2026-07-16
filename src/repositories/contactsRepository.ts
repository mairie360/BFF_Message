import { Pool } from 'pg';

export type ContactUser = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

const pool = new Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME ?? 'mairie_360_database',
  user: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'password',
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export async function listContacts(
  search?: string,
  limit?: number,
  excludedUserId?: number,
): Promise<ContactUser[]> {
  const result = await pool.query<ContactUser>(
    `
      SELECT id, first_name, last_name, email
      FROM users
      WHERE ($1::text IS NULL
         OR first_name ILIKE '%' || $1 || '%'
         OR last_name ILIKE '%' || $1 || '%'
         OR concat_ws(' ', first_name, last_name) ILIKE '%' || $1 || '%'
         OR email ILIKE '%' || $1 || '%')
        AND ($3::int IS NULL OR id <> $3)
      ORDER BY last_name, first_name, id
      LIMIT COALESCE($2::int, 2147483647)
    `,
    [search?.trim() || null, limit ?? null, excludedUserId ?? null],
  );

  return result.rows;
}

export async function getContactUser(id: number): Promise<ContactUser | undefined> {
  const result = await pool.query<ContactUser>(
    'SELECT id, first_name, last_name, email FROM users WHERE id = $1',
    [id],
  );

  return result.rows[0];
}
