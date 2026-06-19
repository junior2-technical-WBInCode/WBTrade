import requests
import json
import time

TOKEN_A = "6010965-6007581-8JLR71SHB190BOWX9LVHNMA34E71LI0QIRZ902SG33XD0ES0LMM357JD4GCUS1KT"
TOKEN_B = "5023012-5076431-2PGXERQPD32C7U64Y00AUAR0GHGLX08OQ90GTHL7A0GKYNU090FSX9BWGAT484V6"

INVENTORY_A = 22954
INVENTORY_B = 104556

API_URL = "https://api.baselinker.com/connector.php"
SLEEP_TIME = 1



def call_api(token, method, parameters, retries=3):
    for attempt in range(retries):
        try:
            response = requests.post(
                API_URL,
                headers={"X-BLToken": token},
                data={
                    "method": method,
                    "parameters": json.dumps(parameters)
                },
                timeout=30
            )
            response.raise_for_status()
            result = response.json()
            if result.get("status") == "ERROR":
                print(f"  API błąd: {result.get('error_code')} - {result.get('error_message')}")
            return result
        except Exception as e:
            print(f"API error: {e}. Retry {attempt+1}/{retries}")
            time.sleep(2)
    raise Exception(f"API call failed after {retries} retries.")


def get_existing_tags(token):
    """Pobiera listę tagów zdefiniowanych na danym koncie."""
    result = call_api(token, "getInventoryTags", [])
    tags = result.get("tags", [])
    return {tag["name"] for tag in tags}


def get_all_products(token, inventory_id):
    products_data = {}
    page = 1
    while True:
        result = call_api(
            token,
            "getInventoryProductsList",
            {"inventory_id": inventory_id, "page": page}
        )
        products = result.get("products", {})
        if not products:
            break
        product_ids = list(products.keys())
        details = call_api(
            token,
            "getInventoryProductsData",
            {"inventory_id": inventory_id, "products": product_ids}
        )
        for pid, product in details.get("products", {}).items():
            sku = product.get("sku", "").strip()
            if not sku:
                continue
            tags = product.get("tags", [])
            if not isinstance(tags, list):
                tags = []
            products_data[sku] = {"tags": tags, "product_id": pid}
        print(f"Pobrano stronę {page} ({len(product_ids)} produktów)")
        page += 1
        time.sleep(SLEEP_TIME * 3)
    return products_data


def update_product_tags(token, inventory_id, product_id, tags):
    result = call_api(
        token,
        "addInventoryProduct",
        {
            "inventory_id": inventory_id,
            "product_id": product_id,
            "tags": tags
        }
    )
    return result


def main():
    # KROK 1: Pobierz istniejące tagi z konta B
    print("=" * 60)
    print("KROK 1: Sprawdzam tagi na koncie B...")
    tags_b = get_existing_tags(TOKEN_B)
    print(f"Tagi na koncie B: {tags_b if tags_b else '(brak)'}")

    # KROK 2: Pobierz produkty z konta A
    print("\nKROK 2: Pobieram produkty z konta A...")
    products_a = get_all_products(TOKEN_A, INVENTORY_A)
    print(f"Łącznie produktów w A: {len(products_a)}")

    # KROK 3: Zbierz wszystkie unikalne tagi z konta A
    all_tags_a = set()
    for data in products_a.values():
        for tag in data["tags"]:
            all_tags_a.add(tag)
    print(f"\nWszystkie unikalne tagi w produktach A: {all_tags_a}")

    # KROK 4: Sprawdź brakujące tagi
    missing_tags = all_tags_a - tags_b
    if missing_tags:
        print("\n" + "!" * 60)
        print("UWAGA! Następujące tagi NIE ISTNIEJĄ na koncie B:")
        for tag in sorted(missing_tags):
            print(f"  ❌ {tag}")
        print("\nMusisz je ręcznie utworzyć w panelu Baselinkera konta B:")
        print("  Produkty → Ustawienia → Tagi")
        print("!" * 60)
        
        input("\nPo utworzeniu tagów naciśnij ENTER, aby kontynuować (lub Ctrl+C aby przerwać)...")
        
        # Sprawdź ponownie
        tags_b = get_existing_tags(TOKEN_B)
        still_missing = all_tags_a - tags_b
        if still_missing:
            print(f"\nNadal brakuje tagów: {still_missing}")
            print("Produkty z tymi tagami zostaną pominięte.")
    else:
        print("\n✅ Wszystkie tagi z konta A istnieją na koncie B!")

    # KROK 5: Pobierz produkty z konta B
    print("\nKROK 5: Pobieram produkty z konta B...")
    products_b = get_all_products(TOKEN_B, INVENTORY_B)
    print(f"Łącznie produktów w B: {len(products_b)}")

    # Odśwież tagi B na wypadek gdyby użytkownik je dodał
    tags_b = get_existing_tags(TOKEN_B)

    sku_to_pid_b = {sku: data["product_id"] for sku, data in products_b.items()}

    # KROK 6: Aktualizuj tagi
    print("\nKROK 6: Aktualizuję tagi...")
    updated = 0
    skipped_no_tag = 0
    skipped_missing = 0
    errors = 0
    total_matched = 0

    for sku, data_a in products_a.items():
        if sku not in sku_to_pid_b:
            continue

        total_matched += 1
        pid_b = sku_to_pid_b[sku]
        tags_a = data_a["tags"]

        if not tags_a:
            skipped_no_tag += 1
            continue

        # Filtruj tagi - używaj tylko tych, które istnieją na koncie B
        valid_tags = [t for t in tags_a if t in tags_b]
        if not valid_tags:
            skipped_missing += 1
            continue

        result = update_product_tags(TOKEN_B, INVENTORY_B, pid_b, valid_tags)

        if result.get("status") == "SUCCESS":
            updated += 1
            if updated % 50 == 0:
                print(f"  Zaktualizowano {updated} produktów...")
        else:
            errors += 1
            print(f"  Błąd dla SKU={sku}: {result}")

        time.sleep(SLEEP_TIME)

    print(f"\n{'=' * 60}")
    print(f"GOTOWE!")
    print(f"  Dopasowanych po SKU: {total_matched}")
    print(f"  Zaktualizowano tagów: {updated}")
    print(f"  Pominięto (brak tagów): {skipped_no_tag}")
    print(f"  Pominięto (tag nie istnieje w B): {skipped_missing}")
    print(f"  Błędów: {errors}")


if __name__ == "__main__":
    main()