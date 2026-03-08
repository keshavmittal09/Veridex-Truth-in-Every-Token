import requests
import json
import sys

payload = {
    "text": "* **NASA Reports:**\n\n* *Mars Habitat Design Challenge* (2020)",
    "mode": "general",
    "provider": "groq"
}

try:
    print("Testing /api/decompose...")
    res = requests.post("http://localhost:8000/api/decompose", json=payload)
    data = res.json()
    print(f"Decomposed Claims: {len(data.get('claims', []))}")
    
    claims = data.get("claims", [])
    if claims:
        print("\nTesting /api/verify stream...")
        verify_payload = {
            "claims": claims,
            "mode": "general",
            "complianceMode": False,
            "confidenceThreshold": 0.8
        }
        with requests.post("http://localhost:8000/api/verify", json=verify_payload, stream=True) as r:
            print(f"Stream Status: {r.status_code}")
            for line in r.iter_lines():
                if line:
                    decoded = line.decode('utf-8')
                    if "429" in decoded or "limit" in decoded.lower():
                        print("RATE LIMIT DETECTED IN STREAM:", decoded)
                    
        print("Verify stream finished successfully.")
except Exception as e:
    print(f"Test Error: {e}")
