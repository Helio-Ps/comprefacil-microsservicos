const express = require('express');
const { pool, toNotification } = require('./db');

const router = express.Router();

router.get('/health', (req, res) => res.json({ service: 'notification-service', status: 'ok' }));

// Lista as notificações enviadas. Filtros opcionais: ?userId=... e ?transactionId=...
router.get('/notifications', async (req, res) => {
  const { userId, transactionId } = req.query;
  const filters = [];
  const params = [];
  if (userId) {
    params.push(String(userId));
    filters.push(`user_id = $${params.length}`);
  }
  if (transactionId) {
    params.push(String(transactionId));
    filters.push(`transaction_id::text = $${params.length}`);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM notifications ${where} ORDER BY sent_at, id LIMIT 100`,
    params,
  );
  res.json(rows.map(toNotification));
});

module.exports = router;
