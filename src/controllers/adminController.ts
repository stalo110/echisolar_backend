import { Request, Response } from 'express';
import { db } from '../config/db';

const parsePositiveInt = (value: unknown, fallback: number, max = 100) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
};

const toNumber = (value: unknown) => Number(value || 0);

export const getDashboardStats = async (_req: Request, res: Response) => {
  try {
    const [orderAggRows] = await db.query(
      `SELECT
         COUNT(*) AS totalOrders,
         COALESCE(SUM(totalAmount), 0) AS grossSales,
         COALESCE(SUM(CASE WHEN paymentStatus = 'paid' THEN totalAmount ELSE 0 END), 0) AS totalSales,
         COALESCE(SUM(CASE WHEN paymentStatus = 'paid' THEN 1 ELSE 0 END), 0) AS paidOrders
       FROM orders`
    );
    const [userRows] = await db.query(
      `SELECT COUNT(*) AS totalUsers
       FROM users
       WHERE role = 'user'`
    );
    const [productRows] = await db.query(
      `SELECT COUNT(*) AS totalProducts
       FROM products
       WHERE isActive = TRUE`
    );
    const [projectRows] = await db.query(
      `SELECT COUNT(*) AS totalProjects
       FROM projects
       WHERE isActive = TRUE`
    );

    const orderAgg = (orderAggRows as any[])[0] || {};
    const userAgg = (userRows as any[])[0] || {};
    const productAgg = (productRows as any[])[0] || {};
    const projectAgg = (projectRows as any[])[0] || {};

    return res.json({
      totalSales: toNumber(orderAgg.totalSales),
      grossSales: toNumber(orderAgg.grossSales),
      orders: toNumber(orderAgg.totalOrders),
      paidOrders: toNumber(orderAgg.paidOrders),
      users: toNumber(userAgg.totalUsers),
      products: toNumber(productAgg.totalProducts),
      projects: toNumber(projectAgg.totalProjects),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
};

export const getAdminOrders = async (req: Request, res: Response) => {
  const page = parsePositiveInt(req.query.page, 1, 10_000);
  const limit = parsePositiveInt(req.query.limit, 10, 100);
  const offset = (page - 1) * limit;

  try {
    const [countRows] = await db.query('SELECT COUNT(*) AS total FROM orders');
    const total = toNumber((countRows as any[])[0]?.total);

    const [rows] = await db.query(
      `SELECT
         o.id,
         o.userId,
         o.totalAmount,
         o.paymentStatus,
         o.status,
         o.placedAt,
         u.name AS customerName,
         u.email AS customerEmail
       FROM orders o
       LEFT JOIN users u ON u.id = o.userId
       ORDER BY o.placedAt DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    return res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch admin orders' });
  }
};

export const getAdminUsers = async (req: Request, res: Response) => {
  const page = parsePositiveInt(req.query.page, 1, 10_000);
  const limit = parsePositiveInt(req.query.limit, 10, 100);
  const role = String(req.query.role || 'user');
  const offset = (page - 1) * limit;

  try {
    const [countRows] = await db.query('SELECT COUNT(*) AS total FROM users WHERE role = ?', [role]);
    const total = toNumber((countRows as any[])[0]?.total);

    const [rows] = await db.query(
      `SELECT id, name, email, role, country, createdAt
       FROM users
       WHERE role = ?
       ORDER BY createdAt DESC
       LIMIT ? OFFSET ?`,
      [role, limit, offset]
    );

    return res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
};

export const getRevenueAnalytics = async (req: Request, res: Response) => {
  const months = parsePositiveInt(req.query.months, 6, 36);

  try {
    const [summaryRows] = await db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN paymentStatus = 'paid' THEN totalAmount ELSE 0 END), 0) AS totalRevenue,
         COALESCE(SUM(totalAmount), 0) AS grossRevenue,
         COUNT(*) AS totalOrders,
         COALESCE(SUM(CASE WHEN paymentStatus = 'paid' THEN 1 ELSE 0 END), 0) AS paidOrders
       FROM orders`
    );

    const [monthlyRows] = await db.query(
      `SELECT
         DATE_FORMAT(placedAt, '%Y-%m') AS month,
         COALESCE(SUM(CASE WHEN paymentStatus = 'paid' THEN totalAmount ELSE 0 END), 0) AS revenue,
         COUNT(*) AS orders
       FROM orders
       WHERE placedAt >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
       GROUP BY DATE_FORMAT(placedAt, '%Y-%m')
       ORDER BY month ASC`,
      [months]
    );

    const [recentPaidRows] = await db.query(
      `SELECT
         o.id,
         o.totalAmount,
         o.placedAt,
         u.name AS customerName,
         u.email AS customerEmail
       FROM orders o
       LEFT JOIN users u ON u.id = o.userId
       WHERE o.paymentStatus = 'paid'
       ORDER BY o.placedAt DESC
       LIMIT 10`
    );

    const summary = (summaryRows as any[])[0] || {};
    const monthly = (monthlyRows as any[]).map((row) => ({
      month: row.month,
      revenue: toNumber(row.revenue),
      orders: toNumber(row.orders),
    }));

    const lastRevenue = monthly.length ? monthly[monthly.length - 1].revenue : 0;
    const prevRevenue = monthly.length > 1 ? monthly[monthly.length - 2].revenue : 0;
    const growthFromLastMonth = prevRevenue > 0 ? ((lastRevenue - prevRevenue) / prevRevenue) * 100 : null;

    return res.json({
      totalRevenue: toNumber(summary.totalRevenue),
      grossRevenue: toNumber(summary.grossRevenue),
      totalOrders: toNumber(summary.totalOrders),
      paidOrders: toNumber(summary.paidOrders),
      growthFromLastMonth,
      monthly,
      recentPaidOrders: recentPaidRows,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch revenue analytics' });
  }
};

