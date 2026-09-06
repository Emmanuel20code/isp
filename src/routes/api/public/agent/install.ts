// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";

const SCRIPT = String.raw`#!/usr/bin/env python3
"""Wifi Billing on-site router agent.

Runs on any always-on machine on the same LAN as the MikroTik (a Raspberry Pi,
mini PC or the office computer). It connects OUT to Wifi Billing over HTTPS, so the
router needs no public IP and no port forwarding.

Setup:
  pip install librouteros requests
  export EMMATECH_URL="https://your-app-url"
  export AGENT_KEY="paste-the-router-agent-key"
  export MIKROTIK_HOST="192.168.88.1"
  export MIKROTIK_USER="admin"
  export MIKROTIK_PASS="your-router-password"
  python3 emmatech-agent.py
"""
import os, time, requests
from librouteros import connect

BASE = os.environ["EMMATECH_URL"].rstrip("/")
KEY = os.environ["AGENT_KEY"]
HOST = os.environ.get("MIKROTIK_HOST", "192.168.88.1")
USER = os.environ.get("MIKROTIK_USER", "admin")
PASS = os.environ.get("MIKROTIK_PASS", "")
VERSION = "1.0.0"


def api():
    return connect(host=HOST, username=USER, password=PASS)


def snapshot(api_conn):
    res = list(api_conn.path("system", "resource"))[0]
    ident = list(api_conn.path("system", "identity"))[0]
    hotspot = len(list(api_conn.path("ip", "hotspot", "active")))
    pppoe = len(list(api_conn.path("ppp", "active")))
    return {
        "agent_version": VERSION,
        "identity": ident.get("name"),
        "ros_version": res.get("version"),
        "uptime": res.get("uptime"),
        "active_hotspot_users": hotspot,
        "active_pppoe_users": pppoe,
    }


def run_command(api_conn, cmd):
    action, p = cmd["action"], cmd.get("payload") or {}

    if action == "hotspot.create_user":
        api_conn.path("ip", "hotspot", "user").add(
            name=p["username"], password=p.get("password", p["username"]),
            profile=p.get("profile", "default"), comment=p.get("comment", "emmatech"))

    elif action == "hotspot.remove_user":
        for u in api_conn.path("ip", "hotspot", "user"):
            if u.get("name") == p["username"]:
                api_conn.path("ip", "hotspot", "user").remove(u[".id"])

    elif action == "hotspot.disconnect":
        for a in api_conn.path("ip", "hotspot", "active"):
            if a.get("user") == p["username"]:
                api_conn.path("ip", "hotspot", "active").remove(a[".id"])

    elif action == "pppoe.create_user":
        api_conn.path("ppp", "secret").add(
            name=p["username"], password=p["password"], service="pppoe",
            profile=p.get("profile", "default"), comment=p.get("comment", "emmatech"))

    elif action == "pppoe.set_enabled":
        for s in api_conn.path("ppp", "secret"):
            if s.get("name") == p["username"]:
                api_conn.path("ppp", "secret").update(
                    **{".id": s[".id"], "disabled": not p.get("enabled", True)})

    elif action == "pppoe.remove_user":
        for s in api_conn.path("ppp", "secret"):
            if s.get("name") == p["username"]:
                api_conn.path("ppp", "secret").remove(s[".id"])

    else:
        raise ValueError("Unsupported action: " + action)

    return {"action": action, "ok": True}


def main():
    results = []
    while True:
        try:
            conn = api()
            body = snapshot(conn)
            body["results"] = results
            r = requests.post(BASE + "/api/public/agent/sync", json=body,
                              headers={"x-agent-key": KEY}, timeout=30)
            r.raise_for_status()
            data = r.json()
            results = []
            for cmd in data.get("commands", []):
                try:
                    out = run_command(conn, cmd)
                    results.append({"id": cmd["id"], "ok": True, "result": out})
                except Exception as exc:
                    results.append({"id": cmd["id"], "ok": False, "error": str(exc)[:400]})
            conn.close()
            time.sleep(int(data.get("poll_seconds", 15)))
        except Exception as exc:
            print("agent error:", exc)
            time.sleep(20)


if __name__ == "__main__":
    main()
`;

export const Route = createFileRoute("/api/public/agent/install")({
  server: {
    handlers: {
      GET: async () =>
        new Response(SCRIPT, {
          headers: {
            "content-type": "text/x-python; charset=utf-8",
            "content-disposition": 'attachment; filename="emmatech-agent.py"',
          },
        }),
    },
  },
});
