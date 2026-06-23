import requests, json

TOKEN_A = "6010965-6007581-8JLR71SHB190BOWX9LVHNMA34E71LI0QIRZ902SG33XD0ES0LMM357JD4GCUS1KT"
TOKEN_B = "5023012-5076431-2PGXERQPD32C7U64Y00AUAR0GHGLX08OQ90GTHL7A0GKYNU090FSX9BWGAT484V6"

for name, token in [("TOKEN_A", TOKEN_A), ("TOKEN_B", TOKEN_B)]:
    print(f"\n=== {name} ===")
    r = requests.post(
        "https://api.baselinker.com/connector.php",
        headers={"X-BLToken": token},
        data={"method": "getInventories", "parameters": json.dumps({})}
    )
    data = r.json()
    if data.get("status") == "ERROR":
        print(f"  ERROR: {data.get('error_message')}")
    else:
        for inv in data.get("inventories", []):
            print(f"  ID: {inv['inventory_id']}  Nazwa: {inv['name']}")
