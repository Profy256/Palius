package main

import (
	"database/sql"
	"fmt"
	"log"
	"strings"

	_ "github.com/jackc/pgx/v5/stdlib"
	_ "modernc.org/sqlite"
)

// ---------------------------------------------------------------------------
// Database dialect layer
//
// Local development runs on SQLite (zero setup, file on disk). Production runs
// on Neon, which is Postgres. The two disagree on enough syntax that the
// difference has to be handled explicitly rather than hoped away:
//
//   placeholders   ?              vs  $1, $2, $3
//   autoincrement  AUTOINCREMENT  vs  GENERATED ... AS IDENTITY
//   timestamps     DATETIME       vs  TIMESTAMPTZ
//   date slicing   substr(x,1,10) vs  to_char(x,'YYYY-MM-DD')
//
// Everything in this file exists so the rest of the codebase can keep writing
// plain `?` queries and stay dialect-agnostic.
// ---------------------------------------------------------------------------

type dialect int

const (
	dialectSQLite dialect = iota
	dialectPostgres
)

var activeDialect = dialectSQLite

func isPostgres() bool { return activeDialect == dialectPostgres }

// rebind rewrites `?` placeholders to `$N` when running on Postgres. Question
// marks inside string literals are left alone.
func rebind(query string) string {
	if !isPostgres() {
		return query
	}
	var b strings.Builder
	n := 0
	inString := false
	for i := 0; i < len(query); i++ {
		c := query[i]
		if c == '\'' {
			// '' inside a string is an escaped quote, not a terminator.
			if inString && i+1 < len(query) && query[i+1] == '\'' {
				b.WriteByte(c)
				b.WriteByte(query[i+1])
				i++
				continue
			}
			inString = !inString
		}
		if c == '?' && !inString {
			n++
			fmt.Fprintf(&b, "$%d", n)
			continue
		}
		b.WriteByte(c)
	}
	return b.String()
}

// dayExpr returns a dialect-correct expression producing YYYY-MM-DD.
func dayExpr(col string) string {
	if isPostgres() {
		return fmt.Sprintf("to_char(%s, 'YYYY-MM-DD')", col)
	}
	return fmt.Sprintf("substr(%s,1,10)", col)
}

// ---------------------------------------------------------------------------
// A thin wrapper so callers keep using db.Query/Exec with `?` placeholders.
// ---------------------------------------------------------------------------

// DB wraps *sql.DB and rebinds every statement for the active dialect.
type DB struct{ *sql.DB }

func (d *DB) Query(q string, args ...interface{}) (*sql.Rows, error) {
	return d.DB.Query(rebind(q), args...)
}
func (d *DB) QueryRow(q string, args ...interface{}) *sql.Row {
	return d.DB.QueryRow(rebind(q), args...)
}
func (d *DB) Exec(q string, args ...interface{}) (sql.Result, error) {
	return d.DB.Exec(rebind(q), args...)
}
func (d *DB) Begin() (*Tx, error) {
	tx, err := d.DB.Begin()
	if err != nil {
		return nil, err
	}
	return &Tx{tx}, nil
}

// Tx mirrors DB for transactions.
type Tx struct{ *sql.Tx }

func (t *Tx) Query(q string, args ...interface{}) (*sql.Rows, error) {
	return t.Tx.Query(rebind(q), args...)
}
func (t *Tx) QueryRow(q string, args ...interface{}) *sql.Row {
	return t.Tx.QueryRow(rebind(q), args...)
}
func (t *Tx) Exec(q string, args ...interface{}) (sql.Result, error) {
	return t.Tx.Exec(rebind(q), args...)
}

// ---------------------------------------------------------------------------
// Schema, rendered per dialect.
// ---------------------------------------------------------------------------

// ddl swaps the handful of type keywords that differ. Keeping one schema
// string with substitutions beats maintaining two that drift apart.
func ddl(s string) string {
	if !isPostgres() {
		return s
	}
	r := strings.NewReplacer(
		"INTEGER PRIMARY KEY AUTOINCREMENT", "BIGSERIAL PRIMARY KEY",
		"DATETIME", "TIMESTAMPTZ",
		"REAL", "DOUBLE PRECISION",
		// SQLite stores booleans as ints; Postgres needs a real type but the
		// code compares against 0/1, so SMALLINT keeps both happy.
		"INTEGER NOT NULL DEFAULT 0", "SMALLINT NOT NULL DEFAULT 0",
	)
	return r.Replace(s)
}

// openDatabase connects to Neon/Postgres when DATABASE_URL is set, otherwise to
// a local SQLite file. Render and Neon both hand you a DATABASE_URL, so the
// same binary works in both places with no code change.
func openDatabase() *DB {
	url := env("DATABASE_URL", "")
	if url == "" {
		url = env("POSTGRES_URL", "") // Vercel/Neon integrations use this name
	}

	if url != "" {
		activeDialect = dialectPostgres
		// Neon requires TLS; add it if the URL omits it.
		if !strings.Contains(url, "sslmode=") {
			sep := "?"
			if strings.Contains(url, "?") {
				sep = "&"
			}
			url += sep + "sslmode=require"
		}
		conn, err := sql.Open("pgx", url)
		if err != nil {
			log.Fatalf("open postgres: %v", err)
		}
		// Neon pools connections at the proxy; a small local pool avoids
		// exhausting the branch's connection limit.
		conn.SetMaxOpenConns(envInt("DB_MAX_CONNS", 10))
		conn.SetMaxIdleConns(envInt("DB_MAX_IDLE", 5))
		if err := conn.Ping(); err != nil {
			log.Fatalf("ping postgres: %v", err)
		}
		log.Printf("database: postgres (neon)")
		return &DB{conn}
	}

	activeDialect = dialectSQLite
	path := env("PALIUS_DB", "palius.db")
	conn, err := sql.Open("sqlite", path)
	if err != nil {
		log.Fatalf("open sqlite: %v", err)
	}
	// SQLite is single-writer; serialising avoids "database is locked".
	conn.SetMaxOpenConns(1)
	log.Printf("database: sqlite (%s)", path)
	return &DB{conn}
}

func envInt(key string, def int) int {
	v := env(key, "")
	if v == "" {
		return def
	}
	var n int
	if _, err := fmt.Sscanf(v, "%d", &n); err != nil || n <= 0 {
		return def
	}
	return n
}
