-- Cada serviço tem o seu próprio banco de dados.
-- Um serviço nunca acessa o banco do outro: eles só conversam pela mensageria.
CREATE DATABASE payment_db;
CREATE DATABASE notification_db;
