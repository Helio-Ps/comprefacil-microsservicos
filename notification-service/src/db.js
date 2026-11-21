const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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

// O serviço de notificação guarda o histórico do que foi enviado no seu próprio banco.
// A restrição UNIQUE (transaction_id, type) impede notificar duas vezes o mesmo evento.
async function createSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id              SERIAL PRIMARY KEY,
      event_id        UUID NOT NULL,
      transaction_id  UUID NOT NULL,
      user_id         TEXT NOT NULL,
      destination     TEXT NOT NULL,
      type            TEXT NOT NULL,
      message         TEXT NOT NULL,
      sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (transaction_id, type)
    )
  `);
}

function toNotification(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    transactionId: row.transaction_id,
    userId: row.user_id,
    destination: row.destination,
    type: row.type,
    message: row.message,
    sentAt: row.sent_at,
  };
}

module.exports = { pool, waitForDatabase, createSchema, toNotification };
