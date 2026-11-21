require('dotenv').config();
const express = require('express');
const { waitForDatabase, createSchema } = require('./db');
const { connectRabbit } = require('./rabbitmq');
const { startProcessor } = require('./processor');
const routes = require('./routes');

async function main() {
  await waitForDatabase();
  await createSchema();
  await connectRabbit();
  await startProcessor(); // interface AMQP (consumidor)

  const app = express(); // interface REST
  app.use(express.json());
  app.use(routes);
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' });
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  });

  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`[pagamento] Serviço de pagamento rodando em http://localhost:${port}`));
}

main().catch((err) => {
  console.error('[pagamento] Falha ao iniciar:', err.message);
  process.exit(1);
});
