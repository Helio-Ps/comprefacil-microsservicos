const express = require('express');
const { pool, toTransaction } = require('./db');
const { publish, ROUTING_KEYS } = require('./rabbitmq');

const router = express.Router();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/health', (req, res) => res.json({ service: 'payment-service', status: 'ok' }));

// Recebe a solicitação de transação.
// A resposta é 202 (Accepted): o pedido foi aceito e o restante do fluxo continua de forma assíncrona.
router.post('/transactions', async (req, res) => {
  const { userId, userEmail, orderNumber, amount } = req.body || {};
  const errors = [];
  if (!userId) errors.push('userId é obrigatório');
  if (!userEmail) errors.push('userEmail é obrigatório');
  if (!orderNumber) errors.push('orderNumber é obrigatório');
  if (!(Number(amount) > 0)) errors.push('amount deve ser um número maior que zero');
  if (errors.length) return res.status(400).json({ errors });

  // Chave opcional para evitar pagamento duplicado quando o cliente reenviar a mesma requisição
  const idempotencyKey = req.get('Idempotency-Key') || null;

  try {
    // Passo I - grava a transação com status PENDENTE
    const inserted = await pool.query(
      `INSERT INTO transactions (user_id, user_email, order_number, amount, idempotency_key)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING *`,
      [String(userId), userEmail, String(orderNumber), Number(amount), idempotencyKey],
    );

    if (!inserted.rows[0]) {
      const existing = await pool.query('SELECT * FROM transactions WHERE idempotency_key = $1', [idempotencyKey]);
      return res.status(200).json({
        message: 'Transação já recebida anteriormente com esta Idempotency-Key',
        transaction: toTransaction(existing.rows[0]),
      });
    }

    const transaction = toTransaction(inserted.rows[0]);
    console.log(`[pagamento] Passo I - transação ${transaction.id} gravada com status PENDENTE`);

    // Passo II - publica o evento para o serviço de notificação (e para o processamento interno)
    await publish(ROUTING_KEYS.RECEIVED, transaction);
    console.log(`[pagamento] Passo II - evento "${ROUTING_KEYS.RECEIVED}" publicado`);

    return res.status(202).json({
      message: 'Solicitação de transação recebida. A confirmação será processada de forma assíncrona.',
      transaction,
    });
  } catch (err) {
    console.error('[pagamento] Erro ao receber transação:', err.message);
    return res.status(503).json({ error: 'Não foi possível registrar a transação agora. Tente novamente.' });
  }
});

router.get('/transactions', async (req, res) => {
  const { userId } = req.query;
  const { rows } = userId
    ? await pool.query('SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC', [String(userId)])
    : await pool.query('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 100');
  res.json(rows.map(toTransaction));
});

router.get('/transactions/:id', async (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) return res.status(404).json({ error: 'Transação não encontrada' });
  const { rows } = await pool.query('SELECT * FROM transactions WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Transação não encontrada' });
  res.json(toTransaction(rows[0]));
});

module.exports = router;
