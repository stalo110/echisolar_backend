import app from './app';
import { db, testConnection } from './config/db';

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await testConnection();
    console.log('Connected to MySQL');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('Failed to connect to DB:', err);
    process.exit(1);
  }
})();
