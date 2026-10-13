"""Serve the prebuilt studio on loopback. No third-party runtime packages needed."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import urllib.request
import webbrowser

URL = 'http://127.0.0.1:5174/'
ROOT = Path(__file__).resolve().parent / 'dist'
if not (ROOT / 'index.html').exists():
    raise SystemExit('未找到构建产物，请先在项目目录运行 npm ci && npm run build。')
try:
    server = ThreadingHTTPServer(('127.0.0.1', 5174), partial(SimpleHTTPRequestHandler, directory=str(ROOT)))
except OSError:
    try:
        with urllib.request.urlopen(URL, timeout=3) as response:
            if '题序' not in response.read(20000).decode('utf-8'):
                raise ValueError('端口被其他程序占用')
    except Exception:
        raise SystemExit('5174 端口被其他程序占用。请关闭该程序后重新启动。')
    webbrowser.open(URL)
    raise SystemExit('题序已经运行，已打开网页。')
print(f'题序已启动：{URL}\n资料仅保存在当前浏览器本机。关闭此终端或按 Ctrl+C 停止网站。')
webbrowser.open(URL)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
