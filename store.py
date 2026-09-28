import json
import os
import threading

import psycopg2
import psycopg2.extras

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()

_lock = threading.Lock()
_initialized = False


def _get_connection():
    if not DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL is not set. Add your Neon Postgres connection string to .env."
        )
    return psycopg2.connect(DATABASE_URL)


def _ensure_table():
    global _initialized
    if _initialized:
        return
    with _lock:
        if _initialized:
            return
        with _get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS candidates (
                        id TEXT PRIMARY KEY,
                        composite_score DOUBLE PRECISION NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL,
                        data JSONB NOT NULL
                    )
                    """
                )
            conn.commit()
        _initialized = True


def get_all_candidates():
    _ensure_table()
    with _get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT data FROM candidates ORDER BY created_at DESC")
            rows = cur.fetchall()
    return [row["data"] for row in rows]


def get_candidate(candidate_id):
    _ensure_table()
    with _get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT data FROM candidates WHERE id = %s", (candidate_id,))
            row = cur.fetchone()
    return row["data"] if row else None


def add_candidate(candidate):
    _ensure_table()
    with _get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO candidates (id, composite_score, created_at, data)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE
                SET composite_score = EXCLUDED.composite_score,
                    data = EXCLUDED.data
                """,
                (
                    candidate["id"],
                    candidate["composite_score"],
                    candidate["created_at"],
                    json.dumps(candidate),
                ),
            )
        conn.commit()


def update_candidate(candidate_id, patch):
    _ensure_table()
    with _get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT data FROM candidates WHERE id = %s", (candidate_id,))
            row = cur.fetchone()
            if row is None:
                return None

            updated = {**row["data"], **patch}

            with conn.cursor() as write_cur:
                write_cur.execute(
                    "UPDATE candidates SET data = %s WHERE id = %s",
                    (json.dumps(updated), candidate_id),
                )
            conn.commit()

    return updated


def delete_candidate(candidate_id):
    _ensure_table()
    with _get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM candidates WHERE id = %s", (candidate_id,))
            deleted = cur.rowcount > 0
        conn.commit()
    return deleted


def delete_all_candidates():
    _ensure_table()
    with _get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM candidates")
            count = cur.rowcount
        conn.commit()
    return count
