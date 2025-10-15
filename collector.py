import requests
import json

servers = [
    "http://server01:8080/metrics",
    "http://server02:8080/metrics",
    "http://server03:8080/metrics",
]

data = {}

for url in servers:
    try:
        res = requests.get(url, timeout=5)
        data[url] = res.json()
    except Exception as e:
        data[url] = {"error": str(e)}

print(json.dumps(data, indent=2))

