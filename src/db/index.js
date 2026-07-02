/**
 * Database layer — uses the built-in node:sqlite module (Node 22+).
 * No native compilation required.
 *
 * Exports a Knex-like `db(tableName)` function that returns a
 * QueryBuilder supporting the patterns used throughout this project:
 *
 *   db('table').where({col: val}).first()
 *   db('table').where({col: val}).orderBy(['c1','c2']).limit(n)
 *   db('table').insert(obj | obj[])        → Promise<[lastId]>
 *   db('table').where({...}).update({...}) → Promise<void>
 *   db('table').where({...}).delete()      → Promise<void>
 *   db('table').join(...).where(...).select(...).whereNotIn(...)
 *   db('table').count('id as c').sum('amount as s').groupByRaw(...)
 *   db.rawAll(sql, ...params)             → row[]
 *   db.rawGet(sql, ...params)             → row | null
 *   db.exec(sql)                          → void (DDL / multi-statement)
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

// ── Bootstrap data directory & connection ─────────────────────────
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'db.sqlite');
const _db = new DatabaseSync(DB_PATH);

_db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');

// ── Helpers ───────────────────────────────────────────────────────

/** Convert JS booleans → SQLite integers */
function boolToInt(v) {
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

function sanitiseParams(arr) {
  return arr.map(boolToInt);
}

// ── QueryBuilder ──────────────────────────────────────────────────

class QueryBuilder {
  constructor(table) {
    this._table = table;
    this._wheres = [];
    this._params = [];
    this._orderBys = [];
    this._limit = null;
    this._joins = [];
    this._selects = null;   // null = use table.*
    this._aggregates = [];  // COUNT / SUM expressions
    this._groupBys = [];
  }

  // ── Conditions ────────────────────────────────────────────────

  /**
   * @param {object|string} cond - plain object of col→val pairs, or raw SQL string
   * @param {*} [val]            - value when cond is a raw SQL string with one '?'
   */
  where(cond, val) {
    if (typeof cond === 'string') {
      this._wheres.push(cond);
      if (val !== undefined) this._params.push(boolToInt(val));
    } else {
      for (const [k, v] of Object.entries(cond)) {
        const col = k.includes('.') ? k : `${this._table}.${k}`;
        this._wheres.push(`${col} = ?`);
        this._params.push(boolToInt(v));
      }
    }
    return this;
  }

  whereRaw(sql, params = []) {
    this._wheres.push(`(${sql})`);
    this._params.push(...sanitiseParams(params));
    return this;
  }

  whereNotIn(col, values) {
    const c = col.includes('.') ? col : `${this._table}.${col}`;
    this._wheres.push(`${c} NOT IN (${values.map(() => '?').join(',')})`);
    this._params.push(...sanitiseParams(values));
    return this;
  }

  // ── Joins ──────────────────────────────────────────────────────

  join(table, col1, col2) {
    this._joins.push(`JOIN ${table} ON ${col1} = ${col2}`);
    return this;
  }

  // ── Projection ─────────────────────────────────────────────────

  /**
   * @param {...(string|{sql:string})} cols - column names or raw SQL objects
   */
  select(...cols) {
    this._selects = cols.flat().map((c) => {
      if (c && typeof c === 'object' && c.sql) return c.sql;
      return c;
    });
    return this;
  }

  // ── Aggregates ─────────────────────────────────────────────────

  count(alias) {
    const [col, as] = alias.split(' as ');
    this._aggregates.push(`COUNT(${col}) as ${(as || col).trim()}`);
    return this;
  }

  sum(alias) {
    const [col, as] = alias.split(' as ');
    this._aggregates.push(`SUM(${col}) as ${(as || col).trim()}`);
    return this;
  }

  groupByRaw(sql) {
    this._groupBys.push(sql);
    return this;
  }

  // ── Ordering / Limiting ────────────────────────────────────────

  /**
   * @param {string|string[]} cols - column name(s)
   * @param {string} [dir]         - ASC | DESC (single column only)
   */
  orderBy(cols, dir = 'ASC') {
    // After GROUP BY or with aggregates, column is an alias — don't prefix
    const noPrefix = this._aggregates.length > 0 || this._groupBys.length > 0;
    const prefix = (col) => {
      if (noPrefix || col.includes('.')) return col;
      return `${this._table}.${col}`;
    };

    if (Array.isArray(cols)) {
      cols.forEach((c) => this._orderBys.push(`${prefix(c)} ASC`));
    } else {
      this._orderBys.push(`${prefix(cols)} ${dir.toUpperCase()}`);
    }
    return this;
  }

  limit(n) {
    this._limit = n;
    return this;
  }

  // ── SQL builder ────────────────────────────────────────────────

  _buildWhere() {
    return this._wheres.length ? `WHERE ${this._wheres.join(' AND ')}` : '';
  }

  _buildSelectCols() {
    if (this._aggregates.length) {
      return [...(this._selects || []), ...this._aggregates].join(', ') || '*';
    }
    return this._selects ? this._selects.join(', ') : `${this._table}.*`;
  }

  _buildSQL() {
    return [
      `SELECT ${this._buildSelectCols()}`,
      `FROM ${this._table}`,
      ...this._joins,
      this._buildWhere(),
      this._groupBys.length ? `GROUP BY ${this._groupBys.join(', ')}` : '',
      this._orderBys.length ? `ORDER BY ${this._orderBys.join(', ')}` : '',
      this._limit ? `LIMIT ${this._limit}` : '',
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }

  _exec() {
    const sql = this._buildSQL();
    return _db.prepare(sql).all(...this._params);
  }

  // ── Thenable interface (supports `await db('t').where(...)`) ───

  then(resolve, reject) {
    try {
      resolve(this._exec());
    } catch (e) {
      reject(e);
    }
  }

  // ── Terminal methods ───────────────────────────────────────────

  /** Returns the first matching row or null */
  first() {
    this._limit = 1;
    try {
      const rows = this._exec();
      return Promise.resolve(rows[0] || null);
    } catch (e) {
      return Promise.reject(e);
    }
  }

  /** Insert one record or an array of records. Returns Promise<[lastInsertRowid]> */
  insert(data) {
    const records = Array.isArray(data) ? data : [data];
    let lastId;
    try {
      for (const record of records) {
        const keys = Object.keys(record);
        const sql = `INSERT INTO ${this._table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
        const result = _db.prepare(sql).run(...sanitiseParams(Object.values(record)));
        lastId = result.lastInsertRowid;
      }
      return Promise.resolve([lastId]);
    } catch (e) {
      return Promise.reject(e);
    }
  }

  /** Update rows matching the current WHERE conditions */
  update(data) {
    const keys = Object.keys(data);
    const sets = keys.map((k) => `${k} = ?`).join(', ');
    const sql = `UPDATE ${this._table} SET ${sets} ${this._buildWhere()}`;
    try {
      _db.prepare(sql).run(...sanitiseParams(Object.values(data)), ...this._params);
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  }

  /** Delete rows matching the current WHERE conditions */
  delete() {
    const sql = `DELETE FROM ${this._table} ${this._buildWhere()}`;
    try {
      _db.prepare(sql).run(...this._params);
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  }
}

// ── Public API ────────────────────────────────────────────────────

/** Returns a QueryBuilder for `table` */
function db(table) {
  return new QueryBuilder(table);
}

/** Creates a raw SQL fragment for use inside .select() */
db.raw = (sql) => ({ sql });

/** Run a raw SELECT that returns multiple rows */
db.rawAll = (sql, ...params) => _db.prepare(sql).all(...sanitiseParams(params));

/** Run a raw SELECT that returns a single row (or null) */
db.rawGet = (sql, ...params) => _db.prepare(sql).get(...sanitiseParams(params)) || null;

/** Execute raw DDL / multi-statement SQL */
db.exec = (sql) => _db.exec(sql);

module.exports = db;
