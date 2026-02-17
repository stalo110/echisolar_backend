import { testConnection } from '../config/db';
import { runMigrations } from '../migrations/runMigrations';

(async () => {
  try {
    await testConnection();
    await runMigrations({ alter: true });
    console.log('Migration run finished');
    process.exit(0);
  } catch (error) {
    console.error('Migration run failed:', error);
    process.exit(1);
  }
})();

