import { Request, Response } from 'express';
import { db } from '../config/db';
import { sendContactReplyEmail } from '../utils/mailer';

type ContactStatus = 'read' | 'unread';

const normalizeStatus = (value: unknown): ContactStatus | '' => {
  const text = String(value || '')
    .trim()
    .toLowerCase();
  if (text === 'read' || text === 'unread') return text;
  return '';
};

export const createContactMessage = async (req: Request, res: Response) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim();
    const subject = String(req.body?.subject || '').trim();
    const message = String(req.body?.message || '').trim();

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'Name, email, subject, and message are required' });
    }

    const [result] = await db.query(
      'INSERT INTO contactMessages (name, email, subject, message, status, replied) VALUES (?,?,?,?,?,?)',
      [name, email, subject, message, 'unread', false]
    );

    return res.status(201).json({
      ok: true,
      data: {
        id: (result as any).insertId,
        name,
        email,
        subject,
        message,
        status: 'unread',
        replied: false,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Unable to submit contact message' });
  }
};

export const getAdminMessages = async (req: Request, res: Response) => {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
  const offset = (page - 1) * limit;
  const status = normalizeStatus(req.query.status);
  const search = String(req.query.search || '').trim().toLowerCase();

  try {
    const whereParts: string[] = [];
    const params: any[] = [];
    if (status) {
      whereParts.push('status = ?');
      params.push(status);
    }
    if (search) {
      whereParts.push('LOWER(name) LIKE ?');
      params.push(`%${search}%`);
    }
    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

    const [rows] = await db.query(
      `SELECT id, name, email, subject, message, status, adminReply, replyDate, replied, createdAt, updatedAt
       FROM contactMessages
       ${whereClause}
       ORDER BY createdAt DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [countRows] = await db.query(
      `SELECT COUNT(*) AS total FROM contactMessages ${whereClause}`,
      params
    );
    const total = Number((countRows as any[])[0]?.total || 0);
    const totalPages = Math.max(Math.ceil(total / limit), 1);

    return res.json({
      ok: true,
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Unable to fetch messages' });
  }
};

export const getAdminMessageById = async (req: Request, res: Response) => {
  const id = Number(req.params.id || 0);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid message id' });

  try {
    const [rows] = await db.query(
      `SELECT id, name, email, subject, message, status, adminReply, replyDate, replied, createdAt, updatedAt
       FROM contactMessages
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    const message = (rows as any[])[0];
    if (!message) return res.status(404).json({ error: 'Message not found' });

    return res.json({ ok: true, data: message });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Unable to fetch message' });
  }
};

export const replyToAdminMessage = async (req: Request, res: Response) => {
  const id = Number(req.params.id || 0);
  const reply = String(req.body?.reply || '').trim();

  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid message id' });
  if (!reply) return res.status(400).json({ error: 'Reply is required' });

  try {
    const [rows] = await db.query('SELECT id, name, email, subject, message FROM contactMessages WHERE id = ? LIMIT 1', [id]);
    const message = (rows as any[])[0];
    if (!message) return res.status(404).json({ error: 'Message not found' });

    await db.query(
      `UPDATE contactMessages
       SET adminReply = ?, replyDate = NOW(), replied = ?, status = ?
       WHERE id = ?`,
      [reply, true, 'read', id]
    );

    await sendContactReplyEmail({
      recipientEmail: String(message.email),
      recipientName: String(message.name || ''),
      subject: String(message.subject || ''),
      originalMessage: String(message.message || ''),
      adminReply: reply,
      messageId: id,
    });

    const [updatedRows] = await db.query(
      `SELECT id, name, email, subject, message, status, adminReply, replyDate, replied, createdAt, updatedAt
       FROM contactMessages
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    return res.json({ ok: true, data: (updatedRows as any[])[0] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Unable to send reply' });
  }
};

export const updateAdminMessageStatus = async (req: Request, res: Response) => {
  const id = Number(req.params.id || 0);
  const status = normalizeStatus(req.body?.status);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid message id' });
  if (!status) return res.status(400).json({ error: 'Invalid status. Use read or unread.' });

  try {
    const [rows] = await db.query('SELECT id FROM contactMessages WHERE id = ? LIMIT 1', [id]);
    if (!(rows as any[])[0]) return res.status(404).json({ error: 'Message not found' });

    await db.query('UPDATE contactMessages SET status = ? WHERE id = ?', [status, id]);

    const [updatedRows] = await db.query(
      `SELECT id, name, email, subject, message, status, adminReply, replyDate, replied, createdAt, updatedAt
       FROM contactMessages
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    return res.json({ ok: true, data: (updatedRows as any[])[0] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Unable to update status' });
  }
};
