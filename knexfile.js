require('dotenv').config();

/**
 * Knex configuration.
 * Uses SQLite in development (no setup required) and Postgres in production.
 * To switch to Postgres: set DATABASE_URL in your environment.
 */
module.exports = {
  development: {
    client: 'better-sqlite3',
    connection: {
      filename: './data/db.sqlite',
    },
    useNullAsDefault: true,
    migrations: {
      directory: './src/db/migrations',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: './src/db/seeds',
    },
  },

  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    pool: { min: 2, max: 10 },
    migrations: {
      directory: './src/db/migrations',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: './src/db/seeds',
    },
  },
};
