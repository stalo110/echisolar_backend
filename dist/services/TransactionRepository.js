"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("../config/db");
class TransactionRepository {
    async create(input) {
        const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;
        const [res] = await db_1.db.query(`INSERT INTO transactions (order_id, user_id, reference, gateway, amount, currency, status, metadata)
       VALUES (?,?,?,?,?,?,?,?)`, [input.order_id, input.user_id, input.reference, input.gateway, input.amount, input.currency, input.status, metadataJson]);
        return res.insertId;
    }
    async findByReference(reference) {
        const [rows] = await db_1.db.query('SELECT * FROM transactions WHERE reference = ? LIMIT 1', [reference]);
        const row = rows[0];
        return row ? this.hydrate(row) : null;
    }
    async updateStatus(reference, status, metadata) {
        const metadataJson = metadata ? JSON.stringify(metadata) : undefined;
        if (metadataJson) {
            await db_1.db.query('UPDATE transactions SET status = ?, metadata = ? WHERE reference = ?', [status, metadataJson, reference]);
        }
        else {
            await db_1.db.query('UPDATE transactions SET status = ? WHERE reference = ?', [status, reference]);
        }
    }
    async updateMetadata(reference, metadata) {
        const metadataJson = metadata ? JSON.stringify(metadata) : null;
        await db_1.db.query('UPDATE transactions SET metadata = ? WHERE reference = ?', [metadataJson, reference]);
    }
    async exists(reference) {
        const [rows] = await db_1.db.query('SELECT id FROM transactions WHERE reference = ? LIMIT 1', [reference]);
        return rows.length > 0;
    }
    hydrate(row) {
        return {
            ...row,
            metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null,
        };
    }
}
exports.default = TransactionRepository;
