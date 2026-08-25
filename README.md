# Multi-Courier Integration Platform

A simple REST API that lets you create, track, and cancel shipments through multiple courier partners from one place. You can also send orders in bulk.

For detailed design, architecture, and testing instructions, see the `Design/` folder.

---

## What it does

- Create shipments with courier partners like `mock_courier` or `urbanebolt`.
- Track shipments and get status history.
- Cancel shipments.
- Send bulk orders in one request.
- Stores all order and tracking data in a local database.

---

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **API Framework**: Express.js
- **Database**: SQLite (default for local development), also supports PostgreSQL
- **ORM**: TypeORM
- **HTTP Client**: Axios with retry and backoff
- **Testing**: Mocha, Chai, Sinon
- **API Docs**: Swagger / OpenAPI 3.0
- **Logging**: Winston

---

## Database

By default, the app uses **SQLite** for development. The database file is `dev.sqlite` in the project root. It is created automatically when you run the app.

To use **PostgreSQL** instead, update your `.env` file with the PostgreSQL settings.

---

## Configuration

Copy the example environment file and update the values:

```bash
cp .env.example .env
```

Main settings:

| Variable | Meaning |
|----------|---------|
| `PORT` | Port the server runs on (default: 3000) |
| `NODE_ENV` | `development` or `production` |
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` | PostgreSQL connection |
| `URBANEBOLT_BASE_URL` | UrbaneBolt API base URL |
| `URBANEBOLT_USERNAME`, `URBANEBOLT_PASSWORD`, `URBANEBOLT_API_KEY` | UrbaneBolt credentials |
| `RETRY_MAX_ATTEMPTS` | How many times to retry failed courier calls |
| `BULK_CONCURRENCY_LIMIT` | How many bulk orders run at once |

---

## Quick Start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment file:

   ```bash
   cp .env.example .env
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

The server runs at `http://localhost:3000`.

---

## API Documentation

OpenAPI docs are available at:

```
http://localhost:3000/api-docs
```

You can also see `TESTME.md` for quick curl examples.

---

## Useful Commands

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the development server with auto-reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled app |
| `npm test` | Run unit tests |
| `npm run codegen` | Bundle `swagger.yaml` into `swagger.json` |

---

## Project Folders

```
Design/           Design documents and detailed README
src/              Source code
src/adapters/     Courier partner integrations
src/services/     Business logic
src/controllers/  API route handlers
src/models/       Database models
src/config/       App and database configuration
test/             Unit tests
```

---

## More Details

- `Design/DETAILED-README.md` — full project overview
- `Design/ARCHITECTURE.md` — architecture and data flow
- `Design/DESIGN.md` — design decisions
- `TESTME.md` — quick curl commands to try the API
