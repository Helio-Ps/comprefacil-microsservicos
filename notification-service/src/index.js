require('dotenv').config();
const express = require('express');
const { waitForDatabase, createSchema } = require('./db');
const { connectRabbit, consume } = require('./rabbitmq');
const { handlePaymentEvent } = require('./notifier');
const routes = require('./routes');

const QUEUE = 'notification.payments';

async function main() {
  await waitForDatabase();
  await createSchema();
  await connectRabbit();

  // Interface AMQP: recebe os eventos de pagamento recebido e confirmado
  await consume(QUEUE, ['transaction.received', 'transaction.confirmed'], handlePaymentEvent);

  const app = express(); // interface REST
  app.use(express.json());
  app.use(routes);
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  });

  const port = Number(process.env.PORT || 3001);
  app.listen(port, () => console.log(`[notificação] Serviço de notificação rodando em http://localhost:${port}`));
}

main().catch((err) => {
  console.error('[notificação] Falha ao iniciar:', err.message);
  process.exit(1);
});
