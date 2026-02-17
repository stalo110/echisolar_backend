import { Request, Response } from 'express';
import { db } from '../config/db';

export const getProfile = async (req: any, res: Response) => {
  const userId = req.user.userId;
  const [rows] = await db.query('SELECT id, name, email, role, address, country, createdAt FROM users WHERE id = ?', [userId]);
  res.json((rows as any[])[0]);
};

export const updateProfile = async (req: any, res: Response) => {
  const userId = req.user.userId;
  const { name, address, country } = req.body;
  await db.query('UPDATE users SET name = ?, address = ?, country = ? WHERE id = ?', [name, address, country, userId]);
  res.json({ message: 'Updated' });
};
