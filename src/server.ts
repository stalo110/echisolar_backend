import app from './app';
import { testConnection } from './config/db';
import { runMigrations } from './migrations/runMigrations';
import { getPaymentEnvironmentSummary } from './utils/paymentEnv';

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await testConnection();
    console.log('Connected to MySQL');
    await runMigrations({ alter: true });
    console.log('Migrations completed');
    const paymentEnv = getPaymentEnvironmentSummary();
    console.log(
      `Payment env: paystack=${paymentEnv.paystack.secretMode} flutterwave=${paymentEnv.flutterwave.secretMode}`
    );
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('Failed to connect to DB:', err);
    process.exit(1);
  }
})();
