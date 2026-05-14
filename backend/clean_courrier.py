import sqlite3
import sys

DB_PATH = "portail.db"
TABLE_NAME = "courrier"

def connect_db():
    try:
        conn = sqlite3.connect(DB_PATH)
        return conn
    except Exception as e:
        print(f"[ERROR] Cannot connect to database: {e}")
        sys.exit(1)

def show_structure(cursor):
    print("\n=== TABLE STRUCTURE ===")
    cursor.execute(f"PRAGMA table_info({TABLE_NAME})")
    columns = cursor.fetchall()

    if not columns:
        print("[WARNING] Table not found or empty.")
        return

    for col in columns:
        # (cid, name, type, notnull, dflt_value, pk)
        print(f"{col[1]} ({col[2]})")

def preview_rows(cursor):
    print("\n=== PREVIEW ROWS TO DELETE ===")

    query = f"""
    SELECT *
    FROM {TABLE_NAME}
    WHERE pdf_path IS NULL
       OR pdf_path = ''
    """

    cursor.execute(query)
    rows = cursor.fetchall()

    count = len(rows)
    print(f"Total rows matching condition: {count}")

    if count == 0:
        return []

    print("\n--- Sample (first 10 rows) ---")
    for r in rows[:10]:
        print(r)

    return rows

def delete_rows(cursor):
    print("\n=== DELETING ROWS ===")

    query = f"""
    DELETE FROM {TABLE_NAME}
    WHERE pdf_path IS NULL
       OR pdf_path = ''
    """

    cursor.execute(query)
    return cursor.rowcount

def main():
    conn = connect_db()
    cursor = conn.cursor()

    # 1. Show structure
    show_structure(cursor)

    # 2. Preview
    rows = preview_rows(cursor)

    if not rows:
        print("\nNothing to delete. Exiting.")
        conn.close()
        return

    # 3. Confirm
    confirm = input("\nDo you want to delete these rows? (y/n): ").strip().lower()

    if confirm != 'y':
        print("Operation cancelled.")
        conn.close()
        return

    try:
        # 4. Transaction safety
        conn.execute("BEGIN")

        deleted_count = delete_rows(cursor)

        conn.commit()
        print(f"\n[SUCCESS] Deleted rows: {deleted_count}")

    except Exception as e:
        conn.rollback()
        print(f"[ERROR] Operation failed, rollback executed: {e}")

    finally:
        conn.close()
        print("Connection closed.")

if __name__ == "__main__":
    main()