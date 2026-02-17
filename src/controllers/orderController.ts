import { Request, RequestHandler, Response } from 'express';
import { db } from '../config/db';
import { notifyOrderStakeholders } from '../utils/mailer';
import { calculateInstallments } from '../services/installmentService';
import { createPaymentDispatcher } from '../services/paymentFactory';
import { logPayment } from '../utils/paymentLogger';

type AuthReq = Request & { user: { userId: number; role: string; email?: string } };

const getOrderUserId = (req: Request) => (req as AuthReq).user.userId;
const paymentDispatcher = createPaymentDispatcher();

export const initiateCheckout: RequestHandler = async (req, res) => {
  const userId = getOrderUserId(req);
  const { shippingAddressId, providerPreference = 'AUTO', planOption = 'full', currency = 'usd' } = req.body;
  try {
    const [cartRows] = await db.query('SELECT id FROM carts WHERE userId = ?', [userId]);
    const cart = (cartRows as any[])[0];
    if (!cart) return res.status(400).json({ error: 'Cart empty' });

    const [items] = await db.query(
      `SELECT ci.id, ci.quantity, p.id as productId, p.name, COALESCE(p.salePrice,p.price) as unitPrice, p.stock
       FROM cartItems ci JOIN products p ON p.id = ci.productId WHERE ci.cartId = ?`,
      [cart.id]
    );
    const cartItems = items as any[];
    if (!cartItems.length) return res.status(400).json({ error: 'Cart empty' });

    for (const it of cartItems) {
      if (it.quantity > it.stock) return res.status(400).json({ error: `Not enough stock for ${it.name}` });
    }

    const subtotal = cartItems.reduce((s, it) => s + it.unitPrice * it.quantity, 0);
    const shipping = 0;
    const total = Number((subtotal + shipping).toFixed(2));

    const [userRows] = await db.query('SELECT country, email FROM users WHERE id = ?', [userId]);
    const user = (userRows as any[])[0];
    const userEmail = user?.email ?? '';
    if (!userEmail) return res.status(400).json({ error: 'User email is required for checkout' });

    const [orderRes] = await db.query('INSERT INTO orders (userId, totalAmount, paymentStatus, status, shippingAddressId) VALUES (?,?,?,?,?)', [
      userId,
      total,
      'pending',
      'pending',
      shippingAddressId || null,
    ]);
    const orderId = (orderRes as any).insertId;

    for (const it of cartItems) {
      await db.query('INSERT INTO orderItems (orderId, productId, quantity, unitPrice) VALUES (?,?,?,?)', [orderId, it.productId, it.quantity, it.unitPrice]);
      await db.query('UPDATE products SET stock = stock - ? WHERE id = ?', [it.quantity, it.productId]);
    }

    await db.query('DELETE FROM cartItems WHERE cartId = ?', [cart.id]);

    const preference = String(providerPreference || 'AUTO').toLowerCase();
    let provider: 'flutterwave' | 'paystack' = 'flutterwave';
    if (preference === 'paystack') {
      provider = 'paystack';
    } else if (preference === 'flutterwave') {
      provider = 'flutterwave';
    } else if (user && (String(user.country).toLowerCase() === 'nigeria' || String(user.country).toLowerCase() === 'ng')) {
      provider = 'paystack';
    }

    const normalizedCurrency = String(currency || 'usd').toUpperCase();
    const itemsForEmail = cartItems.map((it) => ({
      name: it.name,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
    }));

    const sendOrderEmail = (checkoutUrl: string, amount: number, installments?: Parameters<typeof notifyOrderStakeholders>[0]['installments']) =>
      notifyOrderStakeholders({
        orderId,
        customerEmail: userEmail,
        provider,
        currency: normalizedCurrency,
        total: amount,
        checkoutUrl,
        items: itemsForEmail,
        installments,
      });

    if (planOption !== 'full') {
      const months = Number(planOption);
      const schedule = calculateInstallments(total, months);
      for (const s of schedule) {
        await db.query('INSERT INTO installments (orderId, installmentNumber, dueDate, amount, status) VALUES (?,?,?,?,?)', [
          orderId,
          s.installmentNumber,
          s.dueDate,
          s.amount,
          'pending',
        ]);
      }
      const first = schedule[0];
      if (provider === 'flutterwave') {
        const data = await paymentDispatcher.initiate(
          { id: orderId, userId, totalAmount: first.amount },
          'flutterwave',
          userEmail,
          normalizedCurrency,
          { installment: 1 }
        );
        await db.query('INSERT INTO payments (orderId, provider, paymentIntentId, amount, currency, status) VALUES (?,?,?,?,?,?)', [
          orderId,
          'flutterwave',
          (data as any).reference,
          first.amount,
          normalizedCurrency,
          'pending',
        ]);
        await sendOrderEmail((data as any).link, first.amount, schedule);
        return res.json({
          orderId,
          provider,
          authorization_url: (data as any).link,
          tx_ref: (data as any).reference,
          amount: first.amount,
          currency: normalizedCurrency,
        });
      } else {
        const data = await paymentDispatcher.initiate(
          { id: orderId, userId, totalAmount: first.amount },
          'paystack',
          userEmail,
          normalizedCurrency,
          { installment: 1 }
        );
        await db.query('INSERT INTO payments (orderId, provider, paymentIntentId, amount, currency, status) VALUES (?,?,?,?,?,?)', [
          orderId,
          'paystack',
          (data as any).reference,
          first.amount,
          normalizedCurrency,
          'pending',
        ]);
        await sendOrderEmail((data as any).authorization_url, first.amount, schedule);
        return res.json({
          orderId,
          provider,
          authorization_url: (data as any).authorization_url,
          reference: (data as any).reference,
          amount: first.amount,
          currency: normalizedCurrency,
        });
      }
    } else {
      if (provider === 'flutterwave') {
        const data = await paymentDispatcher.initiate(
          { id: orderId, userId, totalAmount: total },
          'flutterwave',
          userEmail,
          normalizedCurrency
        );
        await db.query('INSERT INTO payments (orderId, provider, paymentIntentId, amount, currency, status) VALUES (?,?,?,?,?,?)', [
          orderId,
          'flutterwave',
          (data as any).reference,
          total,
          normalizedCurrency,
          'pending',
        ]);
        await sendOrderEmail((data as any).link, total);
        return res.json({
          orderId,
          provider,
          authorization_url: (data as any).link,
          tx_ref: (data as any).reference,
          amount: total,
          currency: normalizedCurrency,
        });
      } else {
        const data = await paymentDispatcher.initiate(
          { id: orderId, userId, totalAmount: total },
          'paystack',
          userEmail,
          normalizedCurrency
        );
        await db.query('INSERT INTO payments (orderId, provider, paymentIntentId, amount, currency, status) VALUES (?,?,?,?,?,?)', [
          orderId,
          'paystack',
          (data as any).reference,
          total,
          normalizedCurrency,
          'pending',
        ]);
        await sendOrderEmail((data as any).authorization_url, total);
        return res.json({
          orderId,
          provider,
          authorization_url: (data as any).authorization_url,
          reference: (data as any).reference,
          amount: total,
          currency: normalizedCurrency,
        });
      }
    }
  } catch (err: any) {
    logPayment('checkout.error', { error: err.message });
    res.status(500).json({ error: err.message || 'Server error' });
  }
};

export const getOrderById = async (req: any, res: Response) => {
  const userId = req.user.userId;
  const id = Number(req.params.id);
  try {
    const [rows] = await db.query('SELECT * FROM orders WHERE id = ?', [id]);
    const order = (rows as any[])[0];
    if (!order) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'admin' && order.userId !== userId) return res.status(403).json({ error: 'Forbidden' });
    const [items] = await db.query('SELECT oi.*, p.name, p.images FROM orderItems oi JOIN products p ON p.id = oi.productId WHERE oi.orderId = ?', [id]);
    const [payments] = await db.query('SELECT * FROM payments WHERE orderId = ?', [id]);
    const [installments] = await db.query('SELECT * FROM installments WHERE orderId = ?', [id]);
    res.json({ order, items, payments, installments });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

export const getUserOrders = async (req: any, res: Response) => {
  const userId = req.user.userId;
  try {
    const [orders] = await db.query('SELECT * FROM orders WHERE userId = ? ORDER BY placedAt DESC', [userId]);
    res.json(orders);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
};

export const getOrderByPaymentReference = async (req: any, res: Response) => {
  const userId = req.user.userId;
  const reference = String(req.query.reference || '').trim();
  if (!reference) return res.status(400).json({ error: 'Missing reference' });
  try {
    const [rows] = await db.query(
      'SELECT o.id, o.userId FROM payments p JOIN orders o ON o.id = p.orderId WHERE p.paymentIntentId = ? LIMIT 1',
      [reference]
    );
    const match = (rows as any[])[0];
    if (!match) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'admin' && match.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

    const [orderRows] = await db.query('SELECT * FROM orders WHERE id = ?', [match.id]);
    const order = (orderRows as any[])[0];
    const [items] = await db.query('SELECT oi.*, p.name, p.images FROM orderItems oi JOIN products p ON p.id = oi.productId WHERE oi.orderId = ?', [match.id]);
    const [payments] = await db.query('SELECT * FROM payments WHERE orderId = ?', [match.id]);
    const [installments] = await db.query('SELECT * FROM installments WHERE orderId = ?', [match.id]);
    res.json({ order, items, payments, installments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
