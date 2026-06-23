"""Diagnostyka: szuka produktu 212543063 we wszystkich magazynach i sprawdza jego parametry."""
import requests
import json
import time

TOKEN = "6010965-6007581-8JLR71SHB190BOWX9LVHNMA34E71LI0QIRZ902SG33XD0ES0LMM357JD4GCUS1KT"
API_URL = "https://api.baselinker.com/connector.php"

def call_api(method, parameters):
    response = requests.post(
        API_URL,
        headers={"X-BLToken": TOKEN},
        data={"method": method, "parameters": json.dumps(parameters)},
        timeout=30
    )
    return response.json()

# 1. Lista magazynow
print("=== Magazyny ===")
inv_resp = call_api("getInventories", {})
inventories = inv_resp.get("inventories", [])
for inv in inventories:
    print(f"  ID: {inv['inventory_id']}  Nazwa: {inv['name']}")
time.sleep(1)

# 2. Szukaj produktu 212543063 we wszystkich magazynach
target_id = 212543063
print(f"\n=== Szukanie produktu {target_id} ===")

for inv in inventories:
    inv_id = inv["inventory_id"]
    resp = call_api("getInventoryProductsData", {
        "inventory_id": inv_id,
        "products": [target_id]
    })
    products = resp.get("products", {})
    if products:
        print(f"\nZnaleziono w magazynie: {inv['name']} (ID: {inv_id})")
        prod = list(products.values())[0]
        print(f"  Nazwa: {prod.get('text_fields', {}).get('name', '?')}")
        print(f"  SKU: {prod.get('sku')}")
        print(f"  Klucze: {list(prod.keys())}")
        
        # Features
        features = prod.get("features", {})
        print(f"\n  Features ({len(features)}):")
        for fk, fv in features.items():
            print(f"    {fk} = {json.dumps(fv, ensure_ascii=False)[:200]}")
        
        # Wszystkie text_fields
        tf = prod.get("text_fields", {})
        print(f"\n  Text fields ({len(tf)}):")
        for tk, tv in tf.items():
            val = str(tv)[:150]
            print(f"    {tk} = {val}")
        
        # CALY obiekt produktu (surowe dane)
        print(f"\n  === PELNY JSON ===")
        print(json.dumps(prod, ensure_ascii=False, indent=2)[:3000])
        break
    time.sleep(0.5)
else:
    print(f"Produkt {target_id} nie znaleziony w zadnym magazynie!")

# 3. Sprawdz extra fields
print("\n\n=== Extra fields na koncie ===")
ef_resp = call_api("getInventoryExtraFields", {})
for ef in ef_resp.get("extra_fields", []):
    print(f"  ID: {ef['extra_field_id']}  Nazwa: {ef['name']}  Typ: {ef.get('kind', '?')}")

# 4. Sprawdz kategorie z features w roznych magazynach
print("\n\n=== Kategorie z parametrami ===")
for inv in inventories[:4]:
    inv_id = inv["inventory_id"]
    cat_resp = call_api("getInventoryCategories", {"inventory_id": inv_id})
    cats = cat_resp.get("categories", [])
    cats_with_features = [c for c in cats if "features" in c and c["features"]]
    print(f"  Magazyn {inv['name']} ({inv_id}): {len(cats)} kategorii, {len(cats_with_features)} z features")
    if cats_with_features:
        for c in cats_with_features[:2]:
            print(f"    Kategoria: {c['name']}")
            print(f"    Features: {json.dumps(c['features'], ensure_ascii=False)[:300]}")
    time.sleep(0.5)
