import csv
import json
import time
import requests
import os
import sys

# Wymuszenie UTF-8 na konsoli Windows
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# ==============================================================================
# KONFIGURACJA API ALLEGRO
# ==============================================================================
# Wpisz poniżej swoje Client ID oraz Client Secret z Allegro (https://apps.developer.allegro.pl)
CLIENT_ID = "aaaaa69e28d04ede8553cb8f073402d0"
CLIENT_SECRET = "xaytkQhzBQrdpPGmd39oixVoDV9T91GrLIv5J0rK3Sar2ZyquATGofOKMwb4c8BT"

AUTH_URL = "https://allegro.pl/auth/oauth"
API_URL = "https://api.allegro.pl"

HEADERS_BASE = {
    "Accept": "application/vnd.allegro.public.v1+json",
    "Content-Type": "application/vnd.allegro.public.v1+json"
}

def get_device_code():
    url = f"{AUTH_URL}/device"
    auth = requests.auth.HTTPBasicAuth(CLIENT_ID, CLIENT_SECRET)
    data = {"client_id": CLIENT_ID}
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    resp = requests.post(url, auth=auth, data=data, headers=headers)
    resp.raise_for_status()
    return resp.json()

def await_token(device_code, interval=5):
    url = f"{AUTH_URL}/token"
    auth = requests.auth.HTTPBasicAuth(CLIENT_ID, CLIENT_SECRET)
    data = {
        "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
        "device_code": device_code
    }
    
    print("\nOczekiwanie na autoryzację... Proszę otworzyć powyższy link.")
    while True:
        resp = requests.post(url, auth=auth, data=data)
        if resp.status_code == 200:
            return resp.json()["access_token"]
        elif resp.status_code == 400:
            error = resp.json().get("error")
            if error == "authorization_pending":
                time.sleep(interval)
            elif error == "slow_down":
                interval += 1
                time.sleep(interval)
            else:
                raise Exception(f"Błąd podczas autoryzacji: {error}")
        else:
            resp.raise_for_status()

def create_producer(token, data):
    payload = {
        "name": data["internal_name"],
        "producerData": {
            "tradeName": data["producer_name"],
            "address": {
                "countryCode": data["country_code"],
                "city": data["city"],
                "postalCode": data["postal_code"],
                "street": data["street"]
            },
            "contact": {
                "email": data["email"] if data.get("email") else None,
                "phoneNumber": data["phone_number"] if data.get("phone_number") else None,
                "formUrl": data["contact_form_url"] if data.get("contact_form_url") else None
            }
        }
    }
    
    contact = payload["producerData"]["contact"]
    payload["producerData"]["contact"] = {k: v for k, v in contact.items() if v}

    headers = HEADERS_BASE.copy()
    headers["Authorization"] = f"Bearer {token}"
    
    resp = requests.post(f"{API_URL}/sale/responsible-producers", json=payload, headers=headers)
    return resp

def create_responsible_person(token, data):
    payload = {
        "name": data["internal_name"],
        "personalData": {
            "name": data["person_name"],
            "address": {
                "countryCode": data["country_code"],
                "city": data["city"],
                "postalCode": data["postal_code"],
                "street": data["street"]
            },
            "contact": {
                "email": data["email"] if data.get("email") else None,
                "phoneNumber": data["phone_number"] if data.get("phone_number") else None,
                "formUrl": data["contact_form_url"] if data.get("contact_form_url") else None
            }
        }
    }
    
    contact = payload["personalData"]["contact"]
    payload["personalData"]["contact"] = {k: v for k, v in contact.items() if v}

    headers = HEADERS_BASE.copy()
    headers["Authorization"] = f"Bearer {token}"
    
    resp = requests.post(f"{API_URL}/sale/responsible-persons", json=payload, headers=headers)
    return resp

COUNTRY_MAP = {
    "polska": "PL", "poland": "PL",
    "szwajcaria": "CH", "switzerland": "CH",
    "niemcy": "DE", "germany": "DE",
    "czechy": "CZ", "czech republic": "CZ",
    "austria": "AT", "włochy": "IT", "italy": "IT",
    "irlandia": "IE", "ireland": "IE",
    "holandia": "NL", "netherlands": "NL",
    "belgia": "BE", "belgium": "BE",
    "francja": "FR", "france": "FR",
    "hiszpania": "ES", "spain": "ES",
    "wielka brytania": "GB", "uk": "GB", "united kingdom": "GB",
    "szwecja": "SE", "sweden": "SE",
    "słowacja": "SK", "slovakia": "SK",
}

def clean_row(row):
    row = row.copy()
    # Czyszczenie białych znaków w kluczach i wartościach
    row = {k.strip(): v.strip() for k, v in row.items() if k}
    
    country_val = row.get("country_code", "")
    
    # 1. Sprawdzenie czy kolumny są przesunięte (np. w country_code jest ulica)
    if len(country_val) != 2:
        # Prawdopodobnie przesunięcie kolumn: country_code -> street, city -> postalCode, postal_code -> city, street -> country
        actual_street = row.get("country_code")
        actual_postal_code = row.get("city")
        actual_city = row.get("postal_code")
        actual_country_name = row.get("street", "").lower()
        
        actual_country_code = COUNTRY_MAP.get(actual_country_name, "PL")
        
        row["street"] = actual_street
        row["postal_code"] = actual_postal_code
        row["city"] = actual_city
        row["country_code"] = actual_country_code
    else:
        # Kolumny nie są przesunięte, ale może nazwa kraju w country_code jest pełną nazwą?
        country_lower = country_val.lower()
        if country_lower in COUNTRY_MAP:
            row["country_code"] = COUNTRY_MAP[country_lower]
            
    # Upewnijmy się, że kod kraju ma dokładnie 2 litery i jest wielkimi literami
    row["country_code"] = row.get("country_code", "PL")[:2].upper()
    return row

def process_csv(filename, create_function, token, item_type_name):
    actual_filename = filename
    if not os.path.exists(actual_filename):
        alternative = filename + ".csv"
        if os.path.exists(alternative):
            actual_filename = alternative
        else:
            # Sprawdź też wariant bez rozszerzenia .csv w argumencie, np. jeśli na dysku jest gpsr_producenci.csv.csv,
            # a szukamy gpsr_producenci.csv
            alternative2 = filename.replace(".csv", "") + ".csv.csv"
            if os.path.exists(alternative2):
                actual_filename = alternative2
            else:
                print(f"Plik {filename} nie istnieje (szukano także {alternative2}). Pomijam wczytywanie {item_type_name}.")
                return

    print(f"\n--- Przetwarzam plik: {actual_filename} ---")
    
    # Wykrywanie separatora (przecinek lub średnik)
    try:
        with open(actual_filename, 'r', encoding='utf-8') as f:
            first_line = f.readline()
            delimiter = ';' if ';' in first_line else ','
    except Exception as e:
        delimiter = ';'  # domyślny

    with open(actual_filename, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter=delimiter)
        for i, row in enumerate(reader, start=1):
            try:
                row = clean_row(row)
            except Exception as e:
                print(f"[{i}] BŁĄD podczas czyszczenia wiersza ({e})")
                continue

            if not row.get("internal_name") or not row.get("country_code"):
                print(f"[{i}] Pominięto - brak wymaganych danych (wymagane: internal_name, country_code)")
                continue
                
            print(f"[{i}] Wysyłam: {row['internal_name']}...", end=" ")
            try:
                resp = create_function(token, row)
                if resp.status_code in (200, 201):
                    resp_data = resp.json()
                    item_id = resp_data.get('id', 'Brak ID')
                    print(f"SUKCES (ID: {item_id})")
                else:
                    print(f"BŁĄD HTTP {resp.status_code}")
                    try:
                        print("     Szczegóły:", json.dumps(resp.json(), ensure_ascii=False))
                    except:
                        pass
            except Exception as e:
                print(f"BŁĄD KRYTYCZNY ({e})")

def main():
    print("=" * 60)
    print("   WGRYWANIE DANYCH GPSR DO ALLEGRO API (Device Flow)")
    print("=" * 60)

    if CLIENT_ID == "TWÓJ_CLIENT_ID" or CLIENT_SECRET == "TWÓJ_CLIENT_SECRET":
        print("BŁĄD: Musisz najpierw podać CLIENT_ID oraz CLIENT_SECRET w pliku skryptu.")
        print("Możesz je wygenerować na stronie: https://apps.developer.allegro.pl")
        sys.exit(1)

    print("\nRozpoczynam proces autoryzacji Allegro...")
    try:
        device_flow_data = get_device_code()
    except Exception as e:
        print(f"Nie udało się rozpocząć autoryzacji. Błąd: {e}")
        sys.exit(1)

    verification_uri = device_flow_data['verification_uri_complete']
    device_code = device_flow_data['device_code']

    print(f"\n1. Skopiuj i otwórz poniższy link w przeglądarce:")
    print(f"   >>>  {verification_uri}  <<<")
    print("2. Zaloguj się na swoje konto Allegro i zatwierdź dostęp.")

    try:
        token = await_token(device_code)
        print("\n=== UDAŁO SIĘ ZALOGOWAĆ DO ALLEGRO API ===")
    except Exception as e:
        print(f"\nBłąd logowania: {e}")
        sys.exit(1)

    # Przetwarzanie plików CSV
    process_csv("gpsr_producenci.csv", create_producer, token, "producentów")
    process_csv("gpsr_osoby.csv", create_responsible_person, token, "osób odpowiedzialnych")

    print("\nGotowe! Zakończono wgrywanie danych.")

if __name__ == "__main__":
    main()
