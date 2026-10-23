#!/usr/bin/env python3
"""Local cflash helper. Supports Linux and Windows; run only on a computer you trust."""
import hashlib, http.server, json, os, platform, shutil, subprocess, sys, threading, time, urllib.parse

HOST, PORT = "127.0.0.1", 8765
CHUNK = 4 * 1024 * 1024
ALLOWED_ORIGINS = {"https://frozican.github.io", "http://localhost:8000", "http://127.0.0.1:8000"}
PROGRESS = {"stage": "idle", "written": 0, "verified": 0, "total": 0, "speed": 0, "eta": None, "error": None}
PROGRESS_LOCK = threading.Lock()
def update_progress(**values):
    with PROGRESS_LOCK:
        PROGRESS.update(values)
def get_progress():
    with PROGRESS_LOCK:
        return dict(PROGRESS)

def run_json(command):
    p = subprocess.run(command, capture_output=True, text=True, check=True)
    return json.loads(p.stdout or "[]")

def list_drives():
    system = platform.system()
    drives = []
    if system == "Linux":
        data = run_json(["lsblk", "-J", "-b", "-o", "NAME,PATH,SIZE,TYPE,MODEL,SERIAL,TRAN,RM,RO,MOUNTPOINTS"])
        def visit(nodes):
            for d in nodes:
                if d.get("type") == "disk" and d.get("path"):
                    mounts = []
                    def collect(n):
                        if n.get("mountpoints"):
                            mounts.extend(x for x in n["mountpoints"] if x)
                        for c in n.get("children") or []: collect(c)
                    collect(d)
                    drives.append({"id": d["path"], "name": (d.get("model") or "Disk").strip(),
                        "size": int(d.get("size") or 0), "serial": (d.get("serial") or "").strip(),
                        "bus": d.get("tran") or "unknown", "system": False,
                        "mounted": mounts, "readonly": bool(d.get("ro"))})
                visit(d.get("children") or [])
        visit(data.get("blockdevices", []))
    elif system == "Windows":
        script = "Get-Disk | Select-Object Number,FriendlyName,SerialNumber,Size,BusType,IsBoot,IsSystem,IsReadOnly,OperationalStatus | ConvertTo-Json -Compress"
        raw = subprocess.run(["powershell", "-NoProfile", "-Command", script], capture_output=True, text=True, check=True).stdout
        data = json.loads(raw or "[]")
        if isinstance(data, dict): data = [data]
        for d in data:
            drives.append({"id": r"\\.\PhysicalDrive" + str(d["Number"]),
                "name": d.get("FriendlyName") or "Disk", "size": int(d.get("Size") or 0),
                "serial": d.get("SerialNumber") or "", "bus": d.get("BusType") or "unknown",
                "system": bool(d.get("IsBoot") or d.get("IsSystem")),
                "mounted": [], "readonly": bool(d.get("IsReadOnly"))})
    else:
        raise RuntimeError("This helper currently supports Linux and Windows. macOS support is not included yet.")
    return drives

class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "cflash-local/1.0"
    def log_message(self, fmt, *args):
        print("[cflash]", fmt % args)
    def cors(self):
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Target-Confirm, X-Image-Size, X-Block-Size")
    def reply(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body))); self.cors(); self.end_headers(); self.wfile.write(body)
    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.end_headers()
    def do_GET(self):
        if self.path == "/api/status":
            return self.reply(200, {"ok": True, "platform": platform.system()})
        if self.path == "/api/drives":
            try: return self.reply(200, {"drives": list_drives()})
            except Exception as e: return self.reply(500, {"error": str(e)})
        return self.reply(404, {"error": "Not found"})
    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/api/flash":
            return self.reply(404, {"error": "Not found"})
        if self.headers.get("Origin", "") not in ALLOWED_ORIGINS:
            return self.reply(403, {"error": "Origin not allowed"})
        params = urllib.parse.parse_qs(parsed.query)
        target = params.get("device", [""])[0]
        confirm = self.headers.get("X-Target-Confirm", "")
        try:
            size = int(self.headers.get("X-Image-Size", "0"))
            block = int(self.headers.get("X-Block-Size", str(CHUNK)))
            length = int(self.headers.get("Content-Length", "-1"))
        except ValueError:
            return self.reply(400, {"error": "Invalid size header"})
        if not target or confirm != target:
            return self.reply(400, {"error": "Target confirmation does not match"})
        if size <= 0 or length != size or block not in (1048576, 4194304, 8388608, 16777216):
            return self.reply(400, {"error": "Invalid image size, length, or block size"})
        try:
            available = {d["id"]: d for d in list_drives()}
            disk = available.get(target)
            if not disk: return self.reply(400, {"error": "Target is not in the current drive list"})
            if disk["system"]: return self.reply(403, {"error": "Refusing to overwrite a boot/system disk"})
            if disk["readonly"]: return self.reply(403, {"error": "Target disk is read-only"})
            if disk["mounted"]: return self.reply(409, {"error": "Target has mounted partitions. Unmount/eject all target partitions first."})
            if size > disk["size"]: return self.reply(400, {"error": "Image is larger than the selected disk"})
            if platform.system() == "Windows":
                # Raw physical disk access normally requires an elevated terminal.
                f = open(target, "r+b", buffering=0)
            else:
                f = open(target, "r+b", buffering=0)
            written = 0
            with f:
                while written < size:
                    chunk = self.rfile.read(min(block, size - written))
                    if not chunk: raise RuntimeError("Upload ended early; disk may contain a partial image")
                    f.write(chunk); written += len(chunk)
                f.flush(); os.fsync(f.fileno())
            return self.reply(200, {"ok": True, "written": written, "message": "Image write completed. Safely eject the disk before unplugging."})
        except Exception as e:
            return self.reply(500, {"error": str(e), "warning": "The target may have been partially overwritten. Do not unplug it until the system is stable."})

def main():
    if platform.system() not in ("Linux", "Windows"):
        print("Currently supported: Linux and Windows."); sys.exit(1)
    print("cflash local helper listening only on http://127.0.0.1:%d" % PORT)
    print("Disk writes are destructive. Keep this terminal open; stop with Ctrl+C.")
    http.server.ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()

if __name__ == "__main__": main()
