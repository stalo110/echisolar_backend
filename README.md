# EchiSolar Backend

Express + TypeScript API for the EchiSolar React storefront. It manages MySQL data, JWT auth, cart/order workflows, image uploads via Cloudinary and payment orchestration (Flutterwave + Paystack), and exposes webhook handlers for keeping Flutterwave / Paystack statuses in sync.

## Quick start

1. Copy `.env.example` → `.env` and populate every value (Cloudinary + Paystack + Flutterwave + mailer + JWT).
2. Install dependencies and build helpers:

   ```bash
   cd echisolar-backend
   npm install
   ```

3. Create your database and run the schema script before starting:

   ```bash
   # run against the database referenced in DB_NAME
   mysql -u root -p echisolar < src/schema.sql
   ```

4. Seed the users table with known test credentials (see section below), then start in watch mode:

   ```bash
   npm run dev
   ```

## Environment variables

| Variable | Description |
| --- | --- |
| `PORT` | Server port (default `5000`). |
| `NODE_ENV` | `development` or `production`. |
| `DB_*` | MySQL connection details. |
| `JWT_SECRET` | Secret used to sign access tokens. |
| `PAYSTACK_SECRET_KEY` / `PAYSTACK_PUBLIC_KEY` | Paystack API keys. Live aliases are also accepted: `PAYSTACK_LIVE_SECRET_KEY`, `PAYSTACK_LIVE_PUBLIC_KEY`. |
| `PAYSTACK_WEBHOOK_SECRET` | Paystack webhook signing secret. |
| `FLUTTERWAVE_SECRET_KEY` / `FLUTTERWAVE_PUBLIC_KEY` | Flutterwave API keys. Live aliases are also accepted: `FLUTTERWAVE_LIVE_SECRET_KEY`, `FLUTTERWAVE_LIVE_PUBLIC_KEY`. |
| `FLUTTERWAVE_ENCRYPTION_KEY` / `FLUTTERWAVE_WEBHOOK_HASH` | Flutterwave webhook signature secrets. |
| `SMTP_HOST` / `INCOMING_SERVER` | SMTP host (Nodemailer uses either). |
| `SMTP_PORT` | SMTP port (usually 465 for SSL). |
| `SMTP_USER` / `USERNAME` / `EMAIL` | SMTP username (fallback order shown). |
| `SMTP_PASS` / `PASSWORD` | SMTP password. |
| `SMTP_FROM` | Optional custom sender label/email (e.g. `EchiSolar <info@...>`). |
| `ADMIN_NOTIFICATION_EMAIL` | Optional recipient for admin payment alerts. |
| `CLOUDINARY_*` | Cloudinary credentials used when uploading product images. |
| `FRONTEND_URL` | Allowed CORS origin + callback base URL for Paystack and Flutterwave. |

## API snapshot (Postman-ready)

A simple Postman collection is documented in `docs/postman_collection.md`. Highlights:

| Method | Path | Notes |
| --- | --- | --- |
| `POST /api/auth/register` | Register, returns JWT + user object |
| `POST /api/auth/login` | Login (email/password), same payload as register |
| `GET /api/products` | Accepts `category`, `search`, `isLatestArrival` query params |
| `POST /api/products` | Protected: `multipart/form-data` + Cloudinary upload |
| `GET /api/cart` | Requires JWT, returns cart items |
| `POST /api/cart` | `{ productId, quantity }` adds or increments |
| `PUT /api/cart/:itemId` | Adjust quantity for an item |
| `DELETE /api/cart/:itemId` | Remove a single item |
| `DELETE /api/cart` | Clear entire cart |
| `POST /api/orders/checkout` | Initiate Flutterwave/Paystack checkout flow |
| `POST /api/contact` | Save public contact form message |
| `GET /api/admin/messages` | Admin-only inbox for contact submissions |
| `GET /api/admin/messages/:id` | Admin-only message detail |
| `PUT /api/admin/messages/:id/reply` | Admin-only, saves reply and emails sender |
| `PUT /api/admin/messages/:id/status` | Admin-only read/unread update |
| `POST /api/payments/flutterwave/webhook` | Raw body required (configured in `app.ts`) |
| `POST /api/payments/paystack/webhook` | Paystack webhook endpoint |

## Test accounts

Run the following SQL (replace the hashed passwords if you regenerate them) to insert an admin and a customer user for local testing:

```sql
INSERT INTO users (name, email, passwordHash, role, country)
VALUES
  ('Platform Admin', 'admin@echisolar.com', '$2a$10$jXoV8/QW/CkJRxtH4J5eHep/W0LU9qdP1WIyObpN821hxLVv/a9z2', 'admin', 'NG'),
  ('Demo Shopper', 'user@echisolar.com', '$2a$10$Wz7qPOgUsP/.UAAfRHJUMOdxX1vyG3xZ0ee3DwYBNoDIw6FUy3r0a', 'user', 'NG');
```

These credentials unlock the admin dashboard (`/admin/...`) and the standard customer experience; use the same password strings (`Admin123!` / `Customer123!`) when calling the login endpoint.

## Deployment notes

- Build the project with `npm run build` and serve it via `node dist/server.js`.
- Make sure the production database, Paystack/Flutterwave webhook secrets, and Cloudinary assets are set through your hosting provider.
- Configure the SMTP credentials so customer and admin notifications can be sent from `EMAIL`/`USERNAME`.
- Flutterwave/Paystack webhooks must point to `/api/payments/flutterwave/webhook` and `/api/payments/paystack/webhook` respectively.
- Enable SSL and set `NODE_ENV=production` when deploying to avoid leaking stack traces.

## Notes

- Flutterwave expects the raw body for signature verification (the middleware in `app.ts` preserves it).
- A checkout email is sent to the customer (and admin email if configured) with the payment link for Flutterwave/Paystack.
- Welcome emails are triggered on successful registration.
- Successful payment confirmation sends customer + admin notifications with order summary and delivery address.
- Contact form replies from admins are sent by email and logged.
- Email attempts are written to `email_logs` with statuses (`sent`, `failed`, `skipped`).
- Uploaded product images go straight to Cloudinary via the `uploadBufferToCloudinary` helper.
