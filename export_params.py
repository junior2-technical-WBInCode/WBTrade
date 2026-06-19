import requests
import json
import time
import csv
import os
import sys

# Wymuszenie UTF-8 na stdout (Windows cp1250)
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# Token konta BaseLinker
TOKEN = "6010965-6007581-8JLR71SHB190BOWX9LVHNMA34E71LI0QIRZ902SG33XD0ES0LMM357JD4GCUS1KT"

API_URL = "https://api.baselinker.com/connector.php"
SLEEP_TIME = 1  # sekundy miedzy requestami
BATCH_SIZE = 100  # max produktow na batch w getInventoryProductsData

# Magazyny do eksportu
INVENTORIES = [22952, 22953, 22954, 26423, 26591, 26746, 28447]

# Folder wyjsciowy
OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))


def call_api(method, parameters, retries=3):
    for attempt in range(retries):
        try:
            response = requests.post(
                API_URL,
                headers={"X-BLToken": TOKEN},
                data={
                    "method": method,
                    "parameters": json.dumps(parameters)
                },
                timeout=30
            )
            response.raise_for_status()
            result = response.json()
            if result.get("status") == "ERROR":
                print(f"  API blad: {result.get('error_code')} - {result.get('error_message')}")
            return result
        except Exception as e:
            print(f"API error: {e}. Retry {attempt+1}/{retries}")
            time.sleep(2)
    raise Exception(f"API call failed after {retries} retries.")


def get_all_products_with_params(inventory_id):
    """Pobiera wszystkie produkty z magazynu wraz z ich parametrami (features z text_fields)."""
    all_product_ids = []
    page = 1

    # Krok 1: Pobierz liste ID produktow
    while True:
        result = call_api(
            "getInventoryProductsList",
            {"inventory_id": inventory_id, "page": page}
        )
        products = result.get("products", {})
        if not products:
            break
        all_product_ids.extend(list(products.keys()))
        print(f"  Lista strona {page}: {len(products)} produktow (lacznie: {len(all_product_ids)})")
        if len(products) < 1000:
            break
        page += 1
        time.sleep(SLEEP_TIME)

    print(f"  Lacznie produktow: {len(all_product_ids)}")

    # Krok 2: Pobierz szczegoly batchami
    all_data = []
    all_param_names = set()

    for i in range(0, len(all_product_ids), BATCH_SIZE):
        batch_ids = [int(pid) for pid in all_product_ids[i:i + BATCH_SIZE]]
        result = call_api(
            "getInventoryProductsData",
            {"inventory_id": inventory_id, "products": batch_ids}
        )

        for pid, prod in result.get("products", {}).items():
            sku = prod.get("sku", "")
            ean = prod.get("ean", "")
            text_fields = prod.get("text_fields", {})
            name = text_fields.get("name", "")

            # PARAMETRY sa w text_fields["features"] jako dict {nazwa: wartosc}
            features = text_fields.get("features", {})
            if isinstance(features, str):
                # Na wypadek gdyby features byl stringiem JSON
                try:
                    features = json.loads(features)
                except:
                    features = {}

            if isinstance(features, dict):
                for param_name in features.keys():
                    all_param_names.add(param_name)

                all_data.append({
                    "product_id": pid,
                    "sku": sku,
                    "ean": ean,
                    "name": name,
                    "features": features
                })
            else:
                all_data.append({
                    "product_id": pid,
                    "sku": sku,
                    "ean": ean,
                    "name": name,
                    "features": {}
                })

        batch_num = i // BATCH_SIZE + 1
        total_batches = (len(all_product_ids) + BATCH_SIZE - 1) // BATCH_SIZE
        if batch_num % 10 == 0 or batch_num == total_batches:
            print(f"  Batch {batch_num}/{total_batches}...")

        time.sleep(SLEEP_TIME)

    return all_data, sorted(all_param_names)


def sanitize_filename(name):
    """Czysci nazwe pliku z niedozwolonych znakow."""
    for char in ['\\', '/', ':', '*', '?', '"', '<', '>', '|']:
        name = name.replace(char, '_')
    return name


def export_to_csv(inventory_id, inventory_name, products, param_names, output_dir):
    """Eksportuje dane do pliku CSV."""
    safe_name = sanitize_filename(inventory_name)
    filename = os.path.join(output_dir, f"params_{inventory_id}_{safe_name}.csv")

    # Kolumny: stale + dynamiczne parametry
    fixed_cols = ["product_id", "sku", "ean", "name"]
    all_cols = fixed_cols + param_names

    with open(filename, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow(all_cols)

        for prod in products:
            row = [
                prod["product_id"],
                prod["sku"],
                prod["ean"],
                prod["name"]
            ]
            for param in param_names:
                row.append(prod["features"].get(param, ""))
            writer.writerow(row)

    return filename


def main():
    print("=" * 60)
    print("EKSPORT PARAMETROW PRODUKTOW Z BASELINKER")
    print("=" * 60)

    # Pobierz nazwy magazynow
    print("\nPobieram nazwy magazynow...")
    inv_result = call_api("getInventories", {})
    inv_names = {}
    for inv in inv_result.get("inventories", []):
        inv_names[inv["inventory_id"]] = inv["name"]
    time.sleep(SLEEP_TIME)

    for inv_id in INVENTORIES:
        inv_name = inv_names.get(inv_id, str(inv_id))
        print(f"\n{'=' * 60}")
        print(f"Magazyn: {inv_name} (ID: {inv_id})")
        print(f"{'=' * 60}")

        # Pobierz produkty z parametrami
        print("  Pobieram produkty...")
        products, param_names = get_all_products_with_params(inv_id)

        if not products:
            print("  Brak produktow w tym magazynie -- pomijam.")
            continue

        # Ile produktow ma jakiekolwiek parametry
        products_with_params = sum(1 for p in products if p["features"])
        print(f"\n  Produkty z parametrami: {products_with_params}/{len(products)}")

        if param_names:
            print(f"  Znalezione parametry ({len(param_names)}):")
            for pn in param_names:
                count = sum(1 for p in products if p["features"].get(pn, ""))
                print(f"    - {pn} ({count}/{len(products)} produktow)")
        else:
            print("  Brak parametrow w tym magazynie.")

        # Eksport do CSV
        filename = export_to_csv(inv_id, inv_name, products, param_names, OUTPUT_DIR)
        print(f"\n  Zapisano: {filename}")
        print(f"  Produktow: {len(products)}, Parametrow: {len(param_names)}")

    print(f"\n{'=' * 60}")
    print("GOTOWE! Pliki CSV zapisane w:", OUTPUT_DIR)
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
