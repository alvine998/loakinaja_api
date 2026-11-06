# LoakinAja API

Express 5 REST API using MySQL/Sequelize, JWT bearer authentication, and Cloudflare R2 for listing images. Route modules in `src/routes/` map URLs and middleware to request handlers in `src/controllers/`.

## Requirements

- Node.js 20+
- MySQL 8 (create the database named in `DB_NAME` before starting)
- Redis (optional; enables shared PPOB catalog cache and refresh locks)
- Cloudflare R2 bucket and S3-compatible access keys for image uploads

## Run locally

```bash
npm install
cp .env.example .env
```

Set `DB_*`, a strong `JWT_SECRET`, and the initial admin email/password in `.env`. Run the seed command once to create the admin record, then start the API:

```bash
npm run dev
```

The server listens on port 4000 by default. It creates missing Sequelize tables at startup and ensures the admin RBAC role column exists before accepting requests. On existing databases it also promotes the earliest admin to `super_admin` when no super admin exists. For an existing database, apply `migrations/001-listing-moderation.sql` and `migrations/002-ppob-catalog.sql` before deploying this version. Startup also repairs missing PPOB catalog columns on existing installs. `npm run seed` and `npm run migrate:admin-roles` also ensure the RBAC role schema. New databases get the schema directly from the Sequelize models. Configure the R2 fields to enable image uploads; the rest of the API can run without R2 configured.

### Seed demo data

After configuring `.env` and creating the database, run:

```bash
npm run seed
```

The idempotent seed creates default RBAC roles, a `super_admin` using `ADMIN_EMAIL` and `ADMIN_PASSWORD`, plus demo `admin`, `finance`, and `support` accounts. It also adds three demo users and four listings with active, pending, sold, and rejected states. Seeded role-account emails are `admin.demo@loakinaja.local`, `finance.demo@loakinaja.local`, and `support.demo@loakinaja.local`; their shared password is `DemoLoakin123!`. Demo user emails are `nadia.demo@loakinaja.local`, `rizky.demo@loakinaja.local`, and `siti.demo@loakinaja.local`, all using the same demo password. Admin passwords are stored as bcrypt hashes in the `admins` table. The script adds only its fixed records, does not reset or update existing role accounts, and refuses to run when `NODE_ENV=production`.

## Endpoints

All endpoints are prefixed with `/api`.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | No | API and database health |
| GET | `/regions?type=province` | No | List locally stored provinces; use `type=regency&parentId=<province-code>` and `type=district&parentId=<regency-code>` for child regions |
| GET | `/categories` | No | List product categories with their icon names |
| POST | `/categories` | Admin with `categories:manage` | Create a product category and icon |
| PATCH | `/categories/:id` | Admin with `categories:manage` | Rename a category, updating its listings, or change its icon |
| DELETE | `/categories/:id` | Admin with `categories:manage` | Delete an unused category |
| GET | `/listings?q=<search>` | No | Search active listings by title for product suggestions |
| POST | `/escrow-sales` | Bearer token | Start a Rekening Bersama sale for an active listing |
| GET | `/escrow-sales` | Bearer token | List the current user's escrow purchases and sales |
| GET | `/escrow-sales/:id` | Buyer or seller | Get a Rekening Bersama transaction |
| POST | `/escrow-sales/:id/submit-payment` | Buyer | Submit a manual bank-transfer confirmation for admin verification |
| POST | `/escrow-sales/:id/confirm-delivery` | Buyer | Request release after confirming delivery |
| GET | `/withdrawals` | Bearer token | Get seller's available released balance and withdrawal history |
| POST | `/withdrawals` | Bearer token | Request a manual payout (minimum Rp 10,000) |
| GET | `/admin/escrow-sales` | Admin with `finance:view` | Review Rekening Bersama payments and release requests |
| PATCH | `/admin/escrow-sales/:id` | Admin with `finance:view` | Verify payment, cancel an unpaid sale, or release funds after delivery confirmation |
| GET | `/admin/withdrawals` | Admin with `finance:view` | Review seller withdrawals |
| PATCH | `/admin/withdrawals/:id` | Admin with `finance:view` | Mark withdrawal paid or reject it and restore seller balance |
| POST | `/escrow-sales` | Bearer token | Start a Rekening Bersama sale for an active listing |
| GET | `/escrow-sales` | Bearer token | List the current user's escrow purchases and sales |
| GET | `/escrow-sales/:id` | Buyer or seller | Get a Rekening Bersama transaction |
| POST | `/escrow-sales/:id/submit-payment` | Buyer | Submit a manual bank-transfer confirmation for admin verification |
| POST | `/escrow-sales/:id/confirm-delivery` | Buyer | Request release after confirming delivery |
| GET | `/withdrawals` | Bearer token | Get seller's available released balance and withdrawal history |
| POST | `/withdrawals` | Bearer token | Request a manual payout (minimum Rp 10,000) |
| GET | `/admin/escrow-sales` | Admin with `finance:view` | Review Rekening Bersama payments and release requests |
| PATCH | `/admin/escrow-sales/:id` | Admin with `finance:view` | Verify payment, cancel an unpaid sale, or release funds after delivery confirmation |
| GET | `/admin/withdrawals` | Admin with `finance:view` | Review seller withdrawals |
| PATCH | `/admin/withdrawals/:id` | Admin with `finance:view` | Mark withdrawal paid or reject it and restore seller balance |
| GET | `/favorites` | Bearer token | List the current user's active favorite listings |
| GET | `/favorites/:listingId` | Bearer token | Check whether a listing is favorited |
| POST | `/favorites/:listingId` | Bearer token | Add an active listing to favorites |
| DELETE | `/favorites/:listingId` | Bearer token | Remove a listing from favorites |

Product categories are stored in MySQL and seeded with the existing default categories on API startup. Admins can add categories using any supported Lucide icon name; listing submission accepts only active category names.

Rekening Bersama seller balances only increase after admin confirms escrow receipt and then releases the sale after buyer delivery confirmation. Bank transfers and withdrawals are manually verified/processed by admins; there is no payment gateway integration for these flows. A listing marked sold manually does not create a withdrawable balance.

Rekening Bersama seller balances only increase after admin confirms escrow receipt and then releases the sale after buyer delivery confirmation. Bank transfers and withdrawals are manually verified/processed by admins; the application does not yet have a payment gateway integration for these flows. A listing marked sold manually does not create a withdrawable balance.
| POST | `/auth/register` | No | Create an account and return a JWT |
| POST | `/auth/login` | No | Verify credentials and return a JWT |
| GET | `/auth/me` | Bearer token | Get the current account |
| PATCH | `/auth/me` | Bearer token | Update name, email, and phone |
| PATCH | `/auth/me/photo` | Bearer token | Upload or replace the profile photo (`photo` multipart file; JPEG, PNG, or WebP, max 5 MB) |
| POST | `/auth/change-password` | Bearer token | Change account password |
| GET | `/auth/referral-count` | Bearer token | Get referral count |
| POST | `/token-orders` | Bearer token | Create a Mayar invoice for a token package |
| GET | `/token-orders/:id` | Bearer token | Get the current user's token order |
| POST | `/token-orders/:id/verify` | Bearer token | Verify the order against Mayar and credit paid tokens |
| POST | `/payments/mayar/webhook` | Mayar webhook | Verify and settle a `payment.received` transaction |
| GET | `/ppob/products?type=prepaid\|postpaid` | Public | Browse available Digiflazz products |
| POST | `/ppob/quotes` | Optional Bearer token | Quote as a user or create a guest quote with buyer name, email, and phone |
| GET | `/ppob/orders` | Bearer token | List the current user's PPOB orders |
| GET | `/ppob/orders/:id` | Bearer token | Get a PPOB order status |
| POST | `/ppob/orders/:id/payment` | Bearer token | Create Mayar invoice for a quoted PPOB order |
| POST | `/ppob/orders/:id/verify-payment` | Bearer token | Verify Mayar payment and submit/check Digiflazz transaction |
| GET | `/ppob/guest-orders/:id` | `X-Guest-Order-Token` | Read and verify a guest order |
| POST | `/ppob/guest-orders/:id/payment` | `X-Guest-Order-Token` | Create Mayar invoice for a guest order |
| POST | `/ppob/guest-orders/:id/verify-payment` | `X-Guest-Order-Token` | Verify guest payment and provider status |
| POST | `/ppob/digiflazz-webhook` | Digiflazz webhook | Verify and update the provider transaction status |
| GET | `/listings` | No | Browse active listings (`page`, `limit`, `category`, `q`) |
| GET | `/listings/mine` | Bearer token | Get the authenticated user's listings |
| GET | `/listings/:id` | No | Get one approved active or sold listing |
| POST | `/listings` | Bearer token | Create listing; multipart fields plus up to 5 `images` files |
| PATCH | `/listings/:id` | Bearer token | Update own listing fields |
| DELETE | `/listings/:id` | Bearer token | Delete own listing |
| POST | `/admin/login` | No | Admin login; returns an 8-hour admin JWT |
| GET | `/admin/session` | Admin bearer token | Validate admin session |
| GET/POST | `/admin/admins` | `admins:manage` | List or create admins with assigned roles |
| PATCH/DELETE | `/admin/admins/:id` | `admins:manage` | Change another admin's email, password, or role; delete admin |
| POST | `/admin/roles` | `admins:manage` | Create an RBAC role and assign permissions |
| PATCH/DELETE | `/admin/roles/:key` | `admins:manage` | Update or delete a role (assigned roles cannot be deleted) |
| PATCH | `/admin/profile` | Admin bearer token | Update own email or password |
| GET | `/admin/dashboard` | Admin bearer token | Get users and all listings |
| PATCH | `/admin/listings/:id/review` | Admin bearer token | Approve or reject a pending listing |

Example registration:

```json
{
  "name": "Ayu",
  "email": "ayu@example.com",
  "phone": "+628123456789",
  "password": "a-strong-password"
}
```

Send `Authorization: Bearer <token>` to protected routes. Admin login checks the bcrypt password hash in the `admins` table; `ADMIN_EMAIL` and `ADMIN_PASSWORD` are only used to create the initial `super_admin` when running the seed. Admin roles are `super_admin`, `admin`, `finance`, and `support`; their permissions are enforced by the API on every request and reflected in dashboard navigation. The admin JWT expires after 8 hours. New listings are pending review and hidden from public browse/detail routes until approved. Image uploads accept JPEG, PNG, or WebP up to 5 MB per image. R2 bucket objects need public read access (or a configured public custom domain) for returned image URLs to load. Publishing a listing deducts one token in the same transaction as creating it.

## Notes

- Passwords are stored as bcrypt hashes; API responses never include password hashes.
- Set `WEB_ORIGIN` to the frontend origin. For multiple allowed origins, use a comma-separated list.
- Never commit `.env` or production credentials.
- Configure `MAYAR_API_KEY` with a Mayar Headless API key with Read & Write access. `MAYAR_BASE_URL` defaults to production (`https://api.mayar.id/hl/v2`); use `https://api.mayar.io/hl/v2` with a sandbox key for testing. Set the Mayar webhook URL in the Mayar dashboard to `https://<your-api-host>/api/payments/mayar/webhook`. Orders are verified against Mayar's authenticated transaction-detail endpoint before tokens are credited. Token-order tables are created by Sequelize on startup. The API deployment's `WEB_ORIGIN` must point to the frontend public URL so Mayar redirects customers back to the order status page.
- Configure `DIGIFLAZZ_USERNAME`, `DIGIFLAZZ_API_KEY`, and optionally `DIGIFLAZZ_BASE_URL` / `DIGIFLAZZ_TESTING` for the Buyer API. All outbound provider calls are paced by `DIGIFLAZZ_MIN_REQUEST_INTERVAL_MS` (default 1000 ms); with Redis configured this limit and provider `429 Retry-After` cooldowns are shared across API instances. A `429` response is not automatically replayed, avoiding duplicate transaction submissions; new calls wait out the provider cooldown and receive a `Retry-After` header if still throttled by Digiflazz. Digiflazz prepaid and postpaid price lists are cached in MySQL and refreshed no more than once every five minutes per catalog type. Set `REDIS_URL` to enable a shared Redis cache (one-hour TTL) and distributed refresh locks across API instances; if Redis is unset or unavailable, the API falls back to the MySQL catalog. Failed catalog refreshes can retry after 30 seconds and continue serving the last saved catalog when one exists. Existing databases must apply `migrations/002-ppob-catalog.sql`. Set the Digiflazz webhook URL to `https://<your-api-host>/api/ppob/digiflazz-webhook` and configure `DIGIFLAZZ_WEBHOOK_SECRET` to match the webhook secret in Digiflazz. Customer checkout uses Mayar; the provider purchase is only submitted after Mayar confirms payment. Add retail pricing via `PPOB_MARKUP_RUPIAH` (default Rp1,000). Register the existing Mayar webhook endpoint `https://<your-api-host>/api/payments/mayar/webhook`; it handles both token and PPOB order confirmations. Guests provide name, email, and phone with `/ppob/quotes`; its response returns a one-time random access token. Only the token hash is stored. Retain the token in browser session storage and send it as `X-Guest-Order-Token` for guest payment/status requests. Guest routes have dedicated rate limits. Startup migration makes existing PPOB orders guest-capable.
- OTP password reset remains a local demo flow.
- Import or refresh the Indonesian province, regency/city, and district reference data with `npm run regions:sync`. The source is Wilayah.id, which publishes administrative codes and names aligned to Kemendagri data; selectors read the imported rows from the local `regions` table through `/api/regions`.
