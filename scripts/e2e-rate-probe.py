import concurrent.futures
import urllib.error
import urllib.request
from collections import Counter

code = "EV-GSUVV19RRJYIQQFDWYPJDA"
URL = f"http://localhost:4000/api/sessions/access/{code}"

def probe(_):
    try:
        req = urllib.request.Request(URL)
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return "err"

with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
    results = list(pool.map(probe, range(125)))

print("RESULT:", dict(Counter(results)))
