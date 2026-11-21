const amqp = require('amqplib');
const { randomUUID } = require('crypto');

// Exchange do tipo "topic" onde o serviço de pagamento publica os eventos.
// Cada serviço interessado liga a sua própria fila nas chaves que quer receber.
const EXCHANGE = 'payments';
const ROUTING_KEYS = {
  RECEIVED: 'transaction.received',   // solicitação de transação recebida (status PENDENTE)
  CONFIRMED: 'transaction.confirmed', // transação confirmada (status SUCESSO)
};

let channel;

async function connectRabbit(retries = 20) {
  for (let i = 1; i <= retries; i++) {
    try {
      const connection = await amqp.connect(process.env.RABBITMQ_URL);
      connection.on('close', () => {
        console.error('[rabbitmq] Conexão encerrada. Encerrando o serviço para reiniciar.');
        process.exit(1);
      });

      // Canal com confirmação: o RabbitMQ avisa quando recebeu cada mensagem
      channel = await connection.createConfirmChannel();
      await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
      await channel.prefetch(5);
      console.log('[rabbitmq] Conectado');
      return;
    } catch (err) {
      console.log(`[rabbitmq] Indisponível (${i}/${retries}), tentando de novo em 3s...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error('Não foi possível conectar ao RabbitMQ');
}

// Publica um evento e só resolve depois que o RabbitMQ confirmar o recebimento
function publish(routingKey, transaction) {
  const event = {
    eventId: randomUUID(),
    type: routingKey,
    occurredAt: new Date().toISOString(),
    transaction,
  };

  return new Promise((resolve, reject) => {
    channel.publish(
      EXCHANGE,
      routingKey,
      Buffer.from(JSON.stringify(event)),
      { persistent: true, contentType: 'application/json', messageId: event.eventId },
      (err) => (err ? reject(err) : resolve(event)),
    );
  });
}

// Cria uma fila durável ligada à exchange e consome com confirmação manual (ack).
// Se o processamento falhar, a mensagem vai para a fila de mensagens mortas (<fila>.dlq).
async function consume(queue, bindingKey, handler) {
  await channel.assertQueue(`${queue}.dlq`, { durable: true });
  await channel.assertQueue(queue, {
    durable: true,
    deadLetterExchange: '',
    deadLetterRoutingKey: `${queue}.dlq`,
  });
  await channel.bindQueue(queue, EXCHANGE, bindingKey);

  await channel.consume(queue, async (msg) => {
    if (!msg) return;
    try {
      const event = JSON.parse(msg.content.toString());
      await handler(event, msg.fields.routingKey);
      channel.ack(msg);
    } catch (err) {
      console.error(`[rabbitmq] Erro ao processar mensagem da fila ${queue}:`, err.message);
      channel.nack(msg, false, false); // false = não recoloca na fila -> vai para a DLQ
    }
  });
  console.log(`[rabbitmq] Consumindo a fila "${queue}" (${bindingKey})`);
}

module.exports = { connectRabbit, publish, consume, ROUTING_KEYS };
