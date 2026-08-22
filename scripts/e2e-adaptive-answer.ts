import json, sys, urllib.request, urllib.error

code = sys.argv[1]
question = sys.argv[2]
answer = "I would use a queue-backed worker pool with idempotent consumers and dead-letter handling."

body = json.dumps({
    "questionId": "ai-adaptive-0",
    "question": question,
    "answer": answer,
}).encode()
req = urllib.request.Request(
    f"http://localhost:4000/api/ai/access/{code}/adaptive-answer",
    data=body,
    headers={"Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=20) as r:
        print("HTTP:", r.status)
        print(r.read().decode()[:250])
except urllib.error.HTTPError as e:
    print("HTTP:", e.code, e.read().decode()[:250])
