# Stockfolio

> A full-stack web app for personal stock portfolios with a social layer — portfolios, public/private/shared stock lists, friend graphs, reviews, and historical performance. Built on Express + Postgres for UTSC's CSCD43 database management course.

---

## Overview

Stockfolio is a small social-investing app where users can:

- Register and log in with sessions
- Deposit and withdraw cash
- Build portfolios and trade stocks against a price feed
- Curate **stock lists** with three visibility modes: public, private, or shared with specific friends
- Send friend requests, accept/reject, and see what friends are tracking
- Write and edit reviews on stock lists
- Track historical performance of their portfolio over time

The schema is the heart of the project — every read view (dashboard, performance, view-friends) maps to a clean Postgres join, not an N+1 query loop in JavaScript.

---

## Why this exists

Final project for **CSCD43 — Database Management Systems** at the University of Toronto Scarborough (Summer 2024). The course rubric was about *schema design*, so the goal was an interesting domain model with realistic constraints (private content that must not leak, time-series performance data, mutable visibility settings).

---

## Stack

| Layer | Choice |
|-------|--------|
| Server | Node.js + Express |
| Templates | EJS (server-rendered) |
| Database | PostgreSQL (via `pg`) |
| Auth | `express-session` (server-side sessions) |
| Charts | Chart.js (client) |

---

## Schema

The core tables:

```
users            (id, name, email, password)
portfolios       (id, user_id, name, cash)
stocks           (symbol, price, last_updated)
transactions     (id, portfolio_id, stock_symbol, qty, action, timestamp)
stock_lists      (id, owner_id, name, visibility ∈ {public, private, shared})
stock_list_items (list_id, stock_symbol, qty)
list_shares      (list_id, friend_id)            -- who can see a "shared" list
friend_requests  (from_id, to_id, status)
reviews          (id, list_id, author_id, body, created_at)
historical_perf  (portfolio_id, date, total_value)
```

The visibility model matters: a `private` list is visible only to its owner, `public` is visible to everyone, `shared` is visible to its owner plus anyone in `list_shares`. All three rules are enforced on every read in the server, not just hidden in the UI — so a private list won't leak even if its URL is guessed.

---

## Key engineering decisions

1. **Joins over loops.** The dashboard pulls portfolio + transactions + current prices in one query, not three. Same for `view-friends`, `view-stock-lists`, and historical performance.

2. **Sharing rules are server-side, always.** The `WHERE` clause on every list-read query enforces visibility. There is no UI-only "hide this" toggle that a curl request could bypass.

3. **Server-rendered with EJS.** The deliverable was a database course, not a frontend course. EJS keeps the focus on query design and lets every page be inspected and reasoned about in HTTP terms.

4. **Sessions, not JWT.** For a session-heavy app on a single host with sticky state (cash balance, friend graph), `express-session` was simpler and harder to get wrong than a JWT setup that would require its own refresh-token plumbing.

---

## Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### Configure
Edit the database connection in `app.js` (or move to a `.env` and read via `process.env`):

```js
const pool = new Pool({
  user: 'postgres',
  host: 'YOUR_HOST',
  database: 'mydb',
  password: 'YOUR_PASS',
  port: 5432,
});
```

> **Note:** the public repo currently has the credentials inline because it's a course-project artifact running against a teaching DB. Don't deploy this with those values.

### Database
Apply the schema (the SQL is in the repo or course handout):

```bash
psql -d mydb -f schema.sql
```

### Install + run
```bash
npm install
node app.js
```

App listens on port 3000 by default.

---

## Pages

```
/              → landing
/register      → create account
/login         → start session
/dashboard     → portfolios, balances, recent transactions
/buy_stock     → place a buy
/sell_stock    → place a sell
/deposit       → add cash
/withdraw      → remove cash
/historical_performance → time-series chart of total value
/view_stocks   → market view
/view_stock_lists       → discoverable stock lists (public + my own)
/view_stock_list/:id    → single list view (visibility-checked)
/create_stock_list      → new list, default private
/change_visibility/:id  → toggle public / private / shared
/share_stock_list/:id   → invite a friend
/add_review/:listId     → write a review
/edit_review/:id        → edit existing review
/view_reviews/:listId   → all reviews for a list
/send_friend_request    → invite by email
/view_friend_requests   → accept / reject pending
/view_friends           → friends list
/my_account             → email, password, cash
```

---

## Project structure

```
C43-Project/
├── app.js               # Express server + all route handlers
├── views/               # EJS templates (dashboard, login, register, …)
├── public/              # static CSS / client JS
├── package.json
└── README.md
```

---

## Course context

UTSC **CSCD43 — Database Management Systems**, Summer 2024.

---

## License

Course-project artifact; posted for portfolio purposes.
