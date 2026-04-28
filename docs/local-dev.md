# Local Development

This project supports two database backends for local development: SQLite (zero setup) and PostgreSQL (mirrors production).

## SQLite (Default)

No setup required. The app uses SQLite with `better-sqlite3` automatically when `DB_TYPE=sqlite` (the default).

```bash
npm run dev
```

## PostgreSQL via Docker

For a production-like local environment, run PostgreSQL in Docker:

```bash
# Start the database
docker compose up -d

# Verify it's healthy
docker compose ps
```

Then update your `.env` to use Postgres:

```
DB_TYPE=postgres
DATABASE_URL=postgresql://quizlet:quizlet@localhost:5432/quizlet
NODE_ENV=development
```

Restart the dev server:

```bash
npm run dev
```

### Stopping the database

```bash
docker compose down        # keep data
docker compose down -v     # destroy data
```

### Connection details

| Field           | Value                              |
|-----------------|------------------------------------|
| Host            | localhost                           |
| Port            | 5432                               |
| Database        | quizlet                             |
| Username        | quizlet                             |
| Password        | quizlet                             |
| Connection URL  | postgresql://quizlet:quizlet@localhost:5432/quizlet |
