const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Espera o Postgres ficar disponível (útil quando tudo sobe junto no docker-compose)
async function waitForDatabase(retries = 20) {
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      console.log(`[db] Postgres indisponível (${i}/${retries}), tentando de novo em 3s...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error('Não foi possível conectar ao Postgres');
}

async function createSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id          TEXT NOT NULL,
      user_email       TEXT NOT NULL,
      order_number     TEXT NOT NULL,
      amount           NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
      status           TEXT NOT NULL DEFAULT 'PENDENTE',
      idempotency_key  TEXT UNIQUE,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

// Converte a linha do banco para o formato devolvido na API e nas mensagens
function toTransaction(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email,
    orderNumber: row.order_number,
    amount: Number(row.amount),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = { pool, waitForDatabase, createSchema, toTransaction };
