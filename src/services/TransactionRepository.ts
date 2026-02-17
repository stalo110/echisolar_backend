import { db } from '../config/db';

export type TransactionStatus = 'pending' | 'success' | 'failed' | 'processing';
export type TransactionGateway = 'paystack' | 'flutterwave';

export type TransactionRecord = {
  id: number;
  order_id: number;
  user_id: number;
  reference: string;
  gateway: TransactionGateway;
  amount: number;
  currency: string;
  status: TransactionStatus;
  metadata: any;
  created_at: string;
  updated_at: string;
};

export type CreateTransactionInput = Omit<TransactionRecord, 'id' | 'created_at' | 'updated_at'>;

class TransactionRepository {
  async create(input: CreateTransactionInput) {
    const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;
    const [res] = await db.query(
      `INSERT INTO transactions (order_id, user_id, reference, gateway, amount, currency, status, metadata)
       VALUES (?,?,?,?,?,?,?,?)`,
      [input.order_id, input.user_id, input.reference, input.gateway, input.amount, input.currency, input.status, metadataJson]
    );
    return (res as any).insertId as number;
  }

  async findByReference(reference: string) {
    const [rows] = await db.query('SELECT * FROM transactions WHERE reference = ? LIMIT 1', [reference]);
    const row = (rows as any[])[0];
    return row ? this.hydrate(row) : null;
  }

  async updateStatus(reference: string, status: TransactionStatus, metadata?: any) {
    const metadataJson = metadata ? JSON.stringify(metadata) : undefined;
    if (metadataJson) {
      await db.query('UPDATE transactions SET status = ?, metadata = ? WHERE reference = ?', [status, metadataJson, reference]);
    } else {
      await db.query('UPDATE transactions SET status = ? WHERE reference = ?', [status, reference]);
    }
  }

  async updateMetadata(reference: string, metadata: any) {
    const metadataJson = metadata ? JSON.stringify(metadata) : null;
    await db.query('UPDATE transactions SET metadata = ? WHERE reference = ?', [metadataJson, reference]);
  }

  async exists(reference: string) {
    const [rows] = await db.query('SELECT id FROM transactions WHERE reference = ? LIMIT 1', [reference]);
    return (rows as any[]).length > 0;
  }

  private hydrate(row: any): TransactionRecord {
    return {
      ...row,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null,
    } as TransactionRecord;
  }
}

export default TransactionRepository;
