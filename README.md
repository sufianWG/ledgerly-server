# Ledgerly Server

Express + native MongoDB driver API for Ledgerly (Digital Life Lessons). Auth itself is handled by better-auth on the client side; this server verifies the JWT (via JWKS) it issues and serves the lessons, users, reports and stats data.

- Live Site: https://ledgerly-sand-seven.vercel.app
- Client Repo: https://github.com/sufianWG/ledgerly
- Server Repo: https://github.com/sufianWG/ledgerly-server


## Main Routes

- `POST /lessons`, `GET /lessons`, `GET /my-lessons`, `GET /lessons/:id`, `PATCH /lessons/:id`, `DELETE /lessons/:id`
- `PATCH /lessons/:id/like`, `PATCH /lessons/:id/favorite`, `GET /favorites`, `POST /lessons/:id/report`
- `PATCH /users/upgrade` — Stripe success page auto-upgrade
- `GET /platform-stats`, `GET /top-contributors` — public, used on the home page
- `GET /admin/stats`, `GET /admin/users`, `PATCH /admin/users/:id/premium`, `GET /admin/lessons`, `GET /admin/reports`, `PATCH /admin/reports/:id/status` — admin role only

## Environment Variables

```
PORT=
MONGODB_URI=
FRONTEND_URL=
```

## Getting Started

```bash
npm install
npm run dev
```

Runs on `http://localhost:5365` by default.
