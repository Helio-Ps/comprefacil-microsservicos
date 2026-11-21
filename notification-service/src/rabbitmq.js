const amqp = require('amqplib');

// Mesma exchange em que o serviço de pagamento publica os eventos.
// O serviço de notificação não conhece o serviço de pagamento: só conhece a exchange e as chaves.
const EXCHANGE = 'payments';

let channel;

async function connectRabbit(retries = 20) {
  for (let i = 1; i <= retries; i++) {
    try {
      const connection = await amqp.connect(process.env.RABBITMQ_URL);
      connection.on('close', () => {
        console.error('[rabbitmq] Conexão encerrada. Encerrando o serviço para reiniciar.');
        process.exit(1);
      });

      channel = await connection.createChannel();
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

// Fila durável com confirmação manual (ack). Mensagens que falham vão para <fila>.dlq.
async function consume(queue, bindingKeys, handler) {
  await channel.assertQueue(`${queue}.dlq`, { durable: true });
  await channel.assertQueue(queue, {
    durable: true,
    deadLetterExchange: '',
    deadLetterRoutingKey: `${queue}.dlq`,
  });
  for (const key of bindingKeys) {
    await channel.bindQueue(queue, EXCHANGE, key);
  }

  await channel.consume(queue, async (msg) => {
    if (!msg) return;
    try {
      const event = JSON.parse(msg.content.toString());
      await handler(event, msg.fields.routingKey);
      channel.ack(msg); // só confirma depois de notificar e registrar
    } catch (err) {
      console.error(`[rabbitmq] Erro ao processar mensagem da fila ${queue}:`, err.message);
      channel.nack(msg, false, false); // vai para a fila de mensagens mortas (DLQ)
    }
  });
  console.log(`[rabbitmq] Consumindo a fila "${queue}" (${bindingKeys.join(', ')})`);
}

module.exports = { connectRabbit, consume };
