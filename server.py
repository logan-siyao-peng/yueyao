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


def connect():
    DATABASE.parent.mkdir(mode=0o700, exist_ok=True)
    connection = sqlite3.connect(DATABASE)
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
    if attendance == "yes":
        value = payload.get("party_size", "")
        if not re.fullmatch(r"[1-9]|1[0-2]", value):
            raise ValueError("请输入 1 至 12 人。")
        party_size = int(value)
    if len(note) > 1000:
        raise ValueError("留言最多 1000 个字符。")
    return name, email, attendance, party_size, note


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
                    "INSERT INTO rsvps (name,email,attendance,party_size,note) VALUES (?,?,?,?,?)",
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
            "SELECT received_at,name,email,attendance,party_size,note FROM rsvps ORDER BY id"
        )
        writer = csv.writer(sys.stdout)
        writer.writerow([column[0] for column in rows.description])
        for row in rows:
            writer.writerow([protect_csv_cell(value) for value in row])


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
