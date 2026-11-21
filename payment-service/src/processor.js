const { pool, toTransaction } = require('./db');
const { consume, publish, ROUTING_KEYS } = require('./rabbitmq');

const PROCESSING_QUEUE = 'payment.processing';

// Passos IV e V do desafio, executados de forma assíncrona:
// o serviço de pagamento consome o evento "transaction.received" da sua própria fila,
// confirma a transação (status SUCESSO) e publica "transaction.confirmed".
async function startProcessor() {
  const delay = Number(process.env.PROCESSING_DELAY_MS || 5000);

  await consume(PROCESSING_QUEUE, ROUTING_KEYS.RECEIVED, async (event) => {
    const { id } = event.transaction;
    console.log(`[pagamento] Processando transação ${id}...`);

    // Simula o tempo de resposta de um gateway de pagamento externo
    await new Promise((r) => setTimeout(r, delay));

    // Atualização condicional: só muda de PENDENTE para SUCESSO.
    // Se a mesma mensagem chegar duas vezes, a segunda não altera nada.
    await pool.query(
      `UPDATE transactions
          SET status = 'SUCESSO', updated_at = now()
        WHERE id = $1 AND status = 'PENDENTE'`,
      [id],
    );

    const { rows } = await pool.query('SELECT * FROM transactions WHERE id = $1', [id]);
    if (!rows[0]) throw new Error(`Transação ${id} não encontrada`);

    const transaction = toTransaction(rows[0]);
    if (transaction.status !== 'SUCESSO') return;

    console.log(`[pagamento] Passo IV - transação ${id} confirmada (status SUCESSO)`);
    await publish(ROUTING_KEYS.CONFIRMED, transaction);
    console.log(`[pagamento] Passo V - evento "${ROUTING_KEYS.CONFIRMED}" publicado`);
  });
}

module.exports = { startProcessor };
