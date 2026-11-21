const { pool } = require('./db');

const TYPES = {
  'transaction.received': 'PAGAMENTO_RECEBIDO',
  'transaction.confirmed': 'PAGAMENTO_CONFIRMADO',
};

const brl = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function buildMessage(type, t) {
  if (type === 'PAGAMENTO_RECEBIDO') {
    return `Olá! Recebemos a sua solicitação de pagamento do pedido ${t.orderNumber}, ` +
      `no valor de ${brl(t.amount)}. Assim que o pagamento for confirmado, avisaremos você.`;
  }
  return `Pagamento confirmado! O pagamento do pedido ${t.orderNumber}, ` +
    `no valor de ${brl(t.amount)}, foi aprovado. Obrigado por comprar na CompreFácil.`;
}

// Simula o envio do e-mail. Em produção, aqui entraria um provedor de e-mail/SMS.
function sendEmail(destination, subject, body) {
  console.log('------------------------------------------------------------');
  console.log(`[notificação] E-mail enviado para: ${destination}`);
  console.log(`[notificação] Assunto: ${subject}`);
  console.log(`[notificação] ${body}`);
  console.log('------------------------------------------------------------');
}

// Passos III e VI do desafio: lê o evento da fila e notifica o usuário
async function handlePaymentEvent(event, routingKey) {
  const type = TYPES[routingKey];
  if (!type) throw new Error(`Tipo de evento desconhecido: ${routingKey}`);

  const t = event.transaction;
  const message = buildMessage(type, t);

  // Registra primeiro: se o mesmo evento chegar de novo, o INSERT não grava nada
  // e a notificação não é enviada duas vezes.
  const { rows } = await pool.query(
    `INSERT INTO notifications (event_id, transaction_id, user_id, destination, type, message)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (transaction_id, type) DO NOTHING
     RETURNING id`,
    [event.eventId, t.id, t.userId, t.userEmail, type, message],
  );

  if (!rows[0]) {
    console.log(`[notificação] Evento ${type} da transação ${t.id} já notificado, ignorando duplicata`);
    return;
  }

  const step = type === 'PAGAMENTO_RECEBIDO' ? 'Passo III' : 'Passo VI';
  const subject = type === 'PAGAMENTO_RECEBIDO' ? 'Recebemos o seu pagamento' : 'Pagamento confirmado';
  console.log(`[notificação] ${step} - notificando usuário ${t.userId} (transação ${t.id})`);
  sendEmail(t.userEmail, subject, message);
}

module.exports = { handlePaymentEvent };
