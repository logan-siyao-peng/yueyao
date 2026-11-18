"""Local wedding site and RSVP storage. Requires Python 3.9+."""
import argparse
import csv
import json
import re
import sqlite3
import sys
from contextlib import closing
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATABASE = ROOT / ".wedding-data" / "rsvps.sqlite3"


PLANNING_COLUMNS = {
    "contact": "TEXT NOT NULL DEFAULT ''",
    "additional_adults": "INTEGER",
    "child_count": "INTEGER",
    "child_ages": "TEXT NOT NULL DEFAULT ''",
    "companion_names": "TEXT NOT NULL DEFAULT ''",
    "stay_nights": "TEXT NOT NULL DEFAULT ''",
    "dietary_preference": "TEXT NOT NULL DEFAULT ''",
}
RSVP_COLUMNS = ("name", "email", "attendance", "party_size", "note", *PLANNING_COLUMNS)


def connect():
    DATABASE.parent.mkdir(mode=0o700, exist_ok=True)
    connection = sqlite3.connect(DATABASE)
    try:
        with connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute("""
                CREATE TABLE IF NOT EXISTS rsvps (
                    id INTEGER PRIMARY KEY,
                    received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL,
                    attendance TEXT NOT NULL,
                    party_size INTEGER NOT NULL,
                    note TEXT NOT NULL
                )
            """)
            existing = {column[1] for column in connection.execute("PRAGMA table_info(rsvps)")}
            for column, definition in PLANNING_COLUMNS.items():
                if column not in existing:
                    connection.execute(f"ALTER TABLE rsvps ADD COLUMN {column} {definition}")
    except sqlite3.Error:
        connection.close()
        raise
    return connection


def validate(payload):
    if not isinstance(payload, dict) or any(
        not isinstance(value, str) for value in payload.values()
    ):
        raise ValueError("请检查回执格式。")
    name = payload.get("name", "").strip()
    email = payload.get("email", "").strip()
    attendance = payload.get("attendance", "")
    note = payload.get("note", "").strip()
    if not name or len(name) > 100:
        raise ValueError("请输入有效的姓名。")
    if len(email) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+", email):
        raise ValueError("请输入有效的电子邮箱。")
    if attendance not in {"yes", "no", "maybe"}:
        raise ValueError("请选择出席意向。")
    party_size = 0
    contact = payload.get("contact", "").strip()
    additional_adults = child_count = None
    ages = []
    companion_names = stay_nights = ""
    if attendance in {"yes", "maybe"} and "additional_adults" in payload:
        adults = payload["additional_adults"]
        children = payload.get("child_count", "")
        if not all(re.fullmatch(r"[0-9]|1[01]", value) for value in (adults, children)):
            raise ValueError("请填写有效的同行人数及儿童年龄。")
        additional_adults, child_count = int(adults), int(children)
        party_size = 1 + additional_adults + child_count
        ages = [payload.get(f"child_age_{index}", "") for index in range(1, child_count + 1)]
        if party_size > 12 or any(not re.fullmatch(r"[0-9]|1[0-7]", age) for age in ages):
            raise ValueError("请填写有效的同行人数及儿童年龄。")
        companion_names = payload.get("companion_names", "").strip()
        stay_nights = payload.get("stay_nights", "")
    elif attendance == "yes":
        value = payload.get("party_size", "")
        if not re.fullmatch(r"[1-9]|1[0-2]", value):
            raise ValueError("请输入 1 至 12 人。")
        party_size = int(value)
    if len(note) > 1000:
        raise ValueError("留言最多 1000 个字符。")
    if len(contact) > 100 or len(companion_names) > 300 or stay_nights not in {"", "0", "1", "2", "3+"}:
        raise ValueError("请检查联系方式、同行姓名和住宿选项。")
    dietary_preference = payload.get("dietary_preference", "")
    if dietary_preference not in {"", "none", "vegetarian", "vegan", "other"}:
        raise ValueError("请选择有效的饮食选项。")
    return (name, email, attendance, party_size, note, contact, additional_adults,
            child_count, ", ".join(ages), companion_names, stay_nights, dietary_preference)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "public"), **kwargs)

    def translate_path(self, path):
        path = path.split("?", 1)[0]
        if path in {"/", "/index.html"}:
            return str(ROOT / "index.html")
        if path.startswith("/public/"):
            path = path[7:]
        return super().translate_path(path)

    def do_HEAD(self):
        if self.path != "/api/rsvp":
            super().do_HEAD()
            return
        self.send_response(204)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/api/rsvp":
            self.send_json(404, {"error": "页面不存在。"})
            return
        if self.headers.get_content_type() != "application/json":
            self.send_json(415, {"error": "请通过网页提交回执。"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 16384:
                raise ValueError
            payload = json.loads(self.rfile.read(length))
        except (ValueError, UnicodeError, RecursionError):
            self.send_json(400, {"error": "无法读取回执，请检查后重试。"})
            return
        try:
            fields = validate(payload)
        except ValueError as error:
            self.send_json(400, {"error": str(error)})
            return
        try:
            with closing(connect()) as connection, connection:
                connection.execute(
                    f"INSERT INTO rsvps ({', '.join(RSVP_COLUMNS)}) VALUES ({', '.join('?' for _ in RSVP_COLUMNS)})",
                    fields,
                )
        except sqlite3.Error:
            self.log_error("Could not save RSVP")
            self.send_json(503, {"error": "暂时无法保存，请稍后重试。"})
            return
        self.send_json(201, {"received": True})


def protect_csv_cell(value):
    if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@")):
        return "'" + value
    return value


def export_rsvps():
    with closing(connect()) as connection:
        rows = connection.execute(
            f"SELECT received_at, {', '.join(RSVP_COLUMNS)} FROM rsvps ORDER BY id"
        )
        writer = csv.writer(sys.stdout)
        writer.writerow([
            *(column[0] for column in rows.description),
            "under_3", "ages_3_to_12", "ages_13_to_17", "adult_meal_count",
        ])
        adults_index = 1 + RSVP_COLUMNS.index("additional_adults")
        ages_index = 1 + RSVP_COLUMNS.index("child_ages")
        for row in rows:
            groups = (None,) * 4
            if row[adults_index] is not None:
                ages = [int(age) for age in row[ages_index].split(", ") if age]
                older_children = sum(age >= 13 for age in ages)
                groups = (
                    sum(age < 3 for age in ages),
                    sum(3 <= age < 13 for age in ages),
                    older_children,
                    1 + row[adults_index] + older_children,
                )
            writer.writerow([protect_csv_cell(value) for value in (*row, *groups)])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--export", action="store_true", help="Write RSVP CSV to stdout")
    args = parser.parse_args()
    if args.export:
        export_rsvps()
    else:
        with ThreadingHTTPServer(("127.0.0.1", args.port), Handler) as server:
            print(f"Local preview: http://127.0.0.1:{server.server_port}/", flush=True)
            server.serve_forever()
