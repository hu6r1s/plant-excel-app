import argparse
import os
from pathlib import Path
import sqlite3
import sys
from typing import Any


ROOT_DIR = Path(__file__).resolve().parent
APP_DIR = ROOT_DIR / "app"
DEFAULT_DB_PATH = APP_DIR / "data" / "plant_label_helper.db"
ENV_PATH = ROOT_DIR / ".env"
REPLICA_DIR = ROOT_DIR / "data" / "turso"
REPLICA_PATH = REPLICA_DIR / "purchase_entries_migration_replica.db"
TURSO_URL_ENV_KEY = "TURSO_DATABASE_URL"
TURSO_TOKEN_ENV_KEY = "TURSO_AUTH_TOKEN"


def parse_dotenv_value(raw_value: str) -> str:
    value = raw_value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def load_dotenv_values() -> dict[str, str]:
    if not ENV_PATH.exists():
        return {}

    values: dict[str, str] = {}
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("export "):
            stripped = stripped[len("export ") :].strip()
        if "=" not in stripped:
            continue

        key, raw_value = stripped.split("=", 1)
        key = key.strip()
        if not key:
            continue
        values[key] = parse_dotenv_value(raw_value)

    return values


def load_turso_config() -> dict[str, str]:
    dotenv_values = load_dotenv_values()
    process_url = str(os.getenv(TURSO_URL_ENV_KEY) or "").strip()
    process_token = str(os.getenv(TURSO_TOKEN_ENV_KEY) or "").strip()
    dotenv_url = str(dotenv_values.get(TURSO_URL_ENV_KEY, "")).strip()
    dotenv_token = str(dotenv_values.get(TURSO_TOKEN_ENV_KEY, "")).strip()

    url = process_url or dotenv_url
    auth_token = process_token or dotenv_token
    if not url or not auth_token:
        raise RuntimeError(
            f"{ENV_PATH} 또는 시스템 환경변수에 {TURSO_URL_ENV_KEY}, {TURSO_TOKEN_ENV_KEY}를 모두 넣어 주세요."
        )
    if not url.startswith("libsql://"):
        raise RuntimeError("TURSO_DATABASE_URL 값은 libsql:// 로 시작해야 합니다.")

    return {"url": url, "auth_token": auth_token}


def require_libsql() -> Any:
    try:
        import libsql
    except ImportError as error:
        raise RuntimeError("libsql 패키지가 설치되어 있지 않습니다. requirements를 먼저 설치해 주세요.") from error

    return libsql


def maybe_sync_connection(connection: Any) -> None:
    sync = getattr(connection, "sync", None)
    if callable(sync):
        sync()


def close_connection(connection: Any | None) -> None:
    if connection is None:
        return

    close = getattr(connection, "close", None)
    if callable(close):
        close()


def fetch_scalar(connection: Any, query: str, params: tuple[Any, ...] = ()) -> Any:
    cursor = connection.execute(query, params)
    row = cursor.fetchone()
    if row is None:
        return None
    if isinstance(row, (tuple, list)):
        return row[0]
    return row


def cleanup_replica_sidecars(path: Path) -> None:
    candidates = [
        path,
        path.with_suffix(path.suffix + "-wal"),
        path.with_suffix(path.suffix + "-shm"),
    ]
    for candidate in candidates:
        if candidate.exists():
            try:
                candidate.unlink()
            except OSError:
                pass


def ensure_purchase_entries_schema(connection: Any) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS purchase_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL DEFAULT 'plant',
            name TEXT NOT NULL,
            vendor TEXT,
            spec TEXT,
            quantity REAL,
            purchase_count REAL,
            cost REAL,
            wholesale REAL,
            retail REAL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    existing_columns = {
        str(row[1]) for row in connection.execute("PRAGMA table_info(purchase_entries)").fetchall()
    }
    if "vendor" not in existing_columns:
        connection.execute("ALTER TABLE purchase_entries ADD COLUMN vendor TEXT")
    if "purchase_count" not in existing_columns:
        connection.execute("ALTER TABLE purchase_entries ADD COLUMN purchase_count REAL")
    if "category" not in existing_columns:
        connection.execute(
            "ALTER TABLE purchase_entries ADD COLUMN category TEXT NOT NULL DEFAULT 'plant'"
        )
    connection.execute(
        """
        UPDATE purchase_entries
        SET category = 'plant'
        WHERE category IS NULL OR TRIM(category) = ''
        """
    )
    connection.commit()
    maybe_sync_connection(connection)


def load_local_rows(db_path: Path) -> list[tuple[Any, ...]]:
    if not db_path.exists():
        raise RuntimeError(f"로컬 DB 파일을 찾지 못했습니다: {db_path}")

    with sqlite3.connect(db_path) as connection:
        table_exists = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'purchase_entries'"
        ).fetchone()
        if not table_exists:
            return []

        return connection.execute(
            """
            SELECT id,
                   COALESCE(NULLIF(TRIM(category), ''), 'plant') AS category,
                   name,
                   vendor,
                   spec,
                   quantity,
                   purchase_count,
                   cost,
                   wholesale,
                   retail,
                   created_at
            FROM purchase_entries
            ORDER BY id ASC
            """
        ).fetchall()


def open_turso_connection(url: str, auth_token: str) -> Any:
    REPLICA_DIR.mkdir(parents=True, exist_ok=True)
    cleanup_replica_sidecars(REPLICA_PATH)
    libsql = require_libsql()
    connection = libsql.connect(
        str(REPLICA_PATH),
        sync_url=url,
        auth_token=auth_token,
    )
    maybe_sync_connection(connection)
    ensure_purchase_entries_schema(connection)
    return connection


def reset_remote_table(connection: Any) -> None:
    connection.execute("DELETE FROM purchase_entries")
    try:
        connection.execute("DELETE FROM sqlite_sequence WHERE name = 'purchase_entries'")
    except Exception:
        pass
    connection.commit()
    maybe_sync_connection(connection)


def migrate_rows(connection: Any, local_rows: list[tuple[Any, ...]], replace_remote: bool) -> tuple[int, int]:
    remote_count = int(fetch_scalar(connection, "SELECT COUNT(*) FROM purchase_entries") or 0)
    if remote_count > 0 and not replace_remote:
        raise RuntimeError(
            "Turso의 purchase_entries 테이블에 이미 데이터가 있습니다. "
            "원격 데이터를 비우고 다시 올리려면 --replace-remote 옵션으로 다시 실행해 주세요."
        )

    if replace_remote and remote_count > 0:
        reset_remote_table(connection)

    if not local_rows:
        return 0, 0

    connection.executemany(
        """
        INSERT INTO purchase_entries (
            id,
            category,
            name,
            vendor,
            spec,
            quantity,
            purchase_count,
            cost,
            wholesale,
            retail,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        local_rows,
    )
    connection.commit()
    maybe_sync_connection(connection)

    final_count = int(fetch_scalar(connection, "SELECT COUNT(*) FROM purchase_entries") or 0)
    return len(local_rows), final_count


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="로컬 SQLite 매입장 데이터를 Turso purchase_entries 테이블로 이관합니다."
    )
    parser.add_argument(
        "--db",
        default=str(DEFAULT_DB_PATH),
        help="이관할 로컬 SQLite 파일 경로입니다. 기본값은 app/data/plant_label_helper.db 입니다.",
    )
    parser.add_argument(
        "--replace-remote",
        action="store_true",
        help="원격 Turso purchase_entries 데이터를 비우고 로컬 데이터로 다시 채웁니다.",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    db_path = Path(args.db).expanduser().resolve()
    local_rows = load_local_rows(db_path)
    config = load_turso_config()

    print(f"로컬 DB: {db_path}")
    print(f"Turso URL: {config['url']}")
    print(f"로컬 매입장 행 수: {len(local_rows)}")

    if not local_rows:
        print("이관할 purchase_entries 데이터가 없습니다.")
        return 0

    connection = None
    try:
        connection = open_turso_connection(config["url"], config["auth_token"])
        remote_before = int(fetch_scalar(connection, "SELECT COUNT(*) FROM purchase_entries") or 0)
        print(f"원격 매입장 행 수(이관 전): {remote_before}")

        migrated_count, remote_after = migrate_rows(connection, local_rows, args.replace_remote)
    finally:
        close_connection(connection)
        cleanup_replica_sidecars(REPLICA_PATH)

    print(f"이관 완료: {migrated_count}건")
    print(f"원격 매입장 행 수(이관 후): {remote_after}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"이관 실패: {error}", file=sys.stderr)
        raise SystemExit(1)
