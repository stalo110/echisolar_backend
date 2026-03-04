import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../config/db';
import { generateToken } from '../utils/jwt';
import { sendPasswordResetEmail, sendWelcomeEmail } from '../utils/mailer';

type UserRow = {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user' | string;
  country: string | null;
  passwordHash: string;
};

type PasswordResetRow = {
  id: number;
  userId: number;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_RESET_TOKEN_TTL_MINUTES = 30;

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const sanitizeText = (value: unknown) => String(value || '').trim();
const isValidEmail = (value: string) => EMAIL_REGEX.test(value);

const resolveResetTokenTtlMinutes = () => {
  const parsed = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || DEFAULT_RESET_TOKEN_TTL_MINUTES);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_RESET_TOKEN_TTL_MINUTES;
  return Math.floor(Math.min(parsed, 180));
};

export const register = async (req: Request, res: Response) => {
  const name = sanitizeText(req.body?.name);
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');
  const country = sanitizeText(req.body?.country) || null;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: 'Enter a valid email address' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long' });
  }

  try {
    const [existing] = await db.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if ((existing as any[]).length > 0) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const [result] = await db.query('INSERT INTO users (name, email, passwordHash, country) VALUES (?,?,?,?)', [
      name,
      email,
      hashed,
      country,
    ]);

    const userId = (result as any).insertId;
    const token = generateToken(userId, 'user');
    void sendWelcomeEmail({ name, email });
    res.status(201).json({
      token,
      user: {
        id: userId,
        name,
        email,
        country,
        role: 'user',
      },
    });
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'User already exists' });
    }
    return res.status(500).json({ message: 'Server error' });
  }
};

export const login = async (req: Request, res: Response) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: 'Enter a valid email address' });
  }

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
    const user = (rows as UserRow[])[0];
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.passwordHash) return res.status(401).json({ message: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    const token = generateToken(user.id, user.role);
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        country: user.country ?? null,
        role: user.role,
      },
    });
  } catch {
    return res.status(500).json({ message: 'Server error' });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  const email = normalizeEmail(req.body?.email);
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: 'Enter a valid email address' });
  }

  const genericMessage = 'If an account with that email exists, a password reset link has been sent.';

  try {
    const [rows] = await db.query('SELECT id, name, email FROM users WHERE email = ? LIMIT 1', [email]);
    const user = (rows as UserRow[])[0];

    if (!user) return res.json({ message: genericMessage });

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const tokenTtlMinutes = resolveResetTokenTtlMinutes();

    await db.query('UPDATE password_reset_tokens SET usedAt = NOW() WHERE userId = ? AND usedAt IS NULL', [user.id]);
    await db.query(
      'INSERT INTO password_reset_tokens (userId, tokenHash, expiresAt) VALUES (?,?, DATE_ADD(NOW(), INTERVAL ? MINUTE))',
      [user.id, tokenHash, tokenTtlMinutes]
    );

    const frontendBaseUrl = String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
    const resetUrl = `${frontendBaseUrl}/reset-password?token=${token}`;

    void sendPasswordResetEmail({
      name: user.name,
      email: user.email,
      resetUrl,
      expiresInMinutes: tokenTtlMinutes,
    });

    return res.json({ message: genericMessage });
  } catch {
    return res.status(500).json({ message: 'Unable to process forgot password request' });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  const token = sanitizeText(req.body?.token);
  const password = String(req.body?.password || '');
  const confirmPassword = String(req.body?.confirmPassword || '');

  if (!token) return res.status(400).json({ message: 'Reset token is required' });
  if (!password) return res.status(400).json({ message: 'Password is required' });
  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long' });
  }
  if (confirmPassword && password !== confirmPassword) {
    return res.status(400).json({ message: 'Passwords must match' });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const [rows] = await db.query(
      `SELECT id, userId
       FROM password_reset_tokens
       WHERE tokenHash = ?
         AND usedAt IS NULL
         AND expiresAt > NOW()
       LIMIT 1`,
      [tokenHash]
    );
    const resetTokenRow = (rows as PasswordResetRow[])[0];

    if (!resetTokenRow) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query('UPDATE users SET passwordHash = ? WHERE id = ?', [hashedPassword, resetTokenRow.userId]);
    await db.query('UPDATE password_reset_tokens SET usedAt = NOW() WHERE userId = ? AND usedAt IS NULL', [
      resetTokenRow.userId,
    ]);

    return res.json({ message: 'Password reset successful. You can now sign in.' });
  } catch {
    return res.status(500).json({ message: 'Unable to reset password right now' });
  }
};
