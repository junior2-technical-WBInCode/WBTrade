import pandas as pd
import csv
import re
import math

def parse_country(c_str):
    c = str(c_str).strip().upper()
    if 'POLSKA' in c or 'POLAND' in c: return 'PL'
    if 'CHINA' in c or 'CHINY' in c: return 'CN'
    if 'FRANCE' in c or 'FRANCJA' in c: return 'FR'
    if 'GERMANY' in c or 'NIEMCY' in c: return 'DE'
    if 'CZECHY' in c or 'CZECH' in c: return 'CZ'
    if 'ITALY' in c or 'WŁOCHY' in c: return 'IT'
    if 'SPAIN' in c or 'HISZPANIA' in c: return 'ES'
    if 'UK' in c or 'BRYTYJSKA' in c: return 'GB'
    # Default to PL if unknown, user can correct it
    return 'PL'

def parse_address(addr_str):
    addr_str = str(addr_str).strip()
    parts = [p.strip() for p in addr_str.split(',')]
    
    country_code = 'PL'
    city = 'Nieznane'
    postal_code = '00-000'
    street = addr_str
    
    if len(parts) >= 3:
        # Prawdopodobnie: Ulica, Kod Miasto, Kraj
        street = parts[0]
        
        kod_miasto = parts[1].strip()
        m = re.match(r'^([\w-]+)\s+(.*)$', kod_miasto)
        if m:
            postal_code = m.group(1)
            city = m.group(2)
        else:
            city = kod_miasto
            
        country_code = parse_country(parts[-1])
        
    elif len(parts) == 2:
        # Prawdopodobnie: Ulica, Kod Miasto (domyslnie Polska)
        street = parts[0]
        kod_miasto = parts[1].strip()
        m = re.match(r'^([\w-]+)\s+(.*)$', kod_miasto)
        if m:
            postal_code = m.group(1)
            city = m.group(2)
        else:
            city = kod_miasto
            
        # check if last part is country
        if parse_country(parts[1]) != 'PL' and not any(char.isdigit() for char in parts[1]):
            country_code = parse_country(parts[1])
            city = "Nieznane"
            
    return country_code, city[:50], postal_code[:10], street[:100]

def parse_raw_string(raw, is_person=False):
    if not isinstance(raw, str) or len(raw.strip()) == 0:
        return None
    
    # Check if it's "Producent z siedzibą w UE"
    if "siedzibą w ue" in raw.lower() or raw.strip() == "GPSR" or "osoba odpowiedzialna" in raw.lower():
        return None
        
    parts = [p.strip() for p in raw.split('|')]
    name = parts[0] if len(parts) > 0 else "Nieznany"
    address_str = parts[1] if len(parts) > 1 else ""
    email = parts[2] if len(parts) > 2 else ""
    
    country_code, city, postal_code, street = parse_address(address_str)
    
    internal = f"P_{name[:20]}" if not is_person else f"O_{name[:20]}"
    # safe chars for internal
    internal = re.sub(r'[^a-zA-Z0-9_\- ]', '', internal).strip()
    
    # clear email from spaces
    email = email.replace(' ', '')
    
    return {
        "internal_name": internal,
        "name": name[:100],
        "country_code": country_code,
        "city": city if city else "Nieznane",
        "postal_code": postal_code if postal_code else "00-000",
        "street": street if street else "Nieznana",
        "email": email,
        "phone_number": "",
        "contact_form_url": ""
    }

def main():
    try:
        prod_df = pd.read_excel(r'C:\Users\Pracownik Biuro 1\Downloads\gpsr_producenci.xlsx')
        osob_df = pd.read_excel(r'C:\Users\Pracownik Biuro 1\Downloads\gpsr_osoby.xlsx')
    except Exception as e:
        print("Nie moge wczytac Exceli:", e)
        return

    # PRODUCENCI (kolumna indeks 10 -> 'Unnamed: 10')
    producenci_dict = {} # key: raw_string, value: parsed_dict
    
    col_prod = 10 if len(prod_df.columns) > 10 else -1
    if col_prod != -1:
        for val in prod_df.iloc[:, col_prod].dropna():
            parsed = parse_raw_string(val, is_person=False)
            if parsed and parsed['internal_name'] not in producenci_dict:
                producenci_dict[parsed['internal_name']] = parsed

    # OSOBY (kolumna indeks 11 -> 'Unnamed: 11')
    osoby_dict = {}
    col_osob = 11 if len(osob_df.columns) > 11 else -1
    if col_osob != -1:
        # pomin pierwszy wiersz jezeli to naglowki z "GPSR"
        for val in osob_df.iloc[:, col_osob].dropna():
            parsed = parse_raw_string(val, is_person=True)
            if parsed and parsed['internal_name'] not in osoby_dict:
                osoby_dict[parsed['internal_name']] = parsed

    # Zapis Producenci do CSV
    with open('gpsr_producenci.csv', 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f, delimiter=';')
        writer.writerow(['internal_name','producer_name','country_code','city','postal_code','street','email','phone_number','contact_form_url'])
        for v in producenci_dict.values():
            writer.writerow([
                v['internal_name'], v['name'], v['country_code'], v['city'], 
                v['postal_code'], v['street'], v['email'], v['phone_number'], v['contact_form_url']
            ])
            
    # Zapis Osoby do CSV
    with open('gpsr_osoby.csv', 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f, delimiter=';')
        writer.writerow(['internal_name','person_name','country_code','city','postal_code','street','email','phone_number','contact_form_url'])
        for v in osoby_dict.values():
            writer.writerow([
                v['internal_name'], v['name'], v['country_code'], v['city'], 
                v['postal_code'], v['street'], v['email'], v['phone_number'], v['contact_form_url']
            ])
            
    print(f"Zapisano {len(producenci_dict)} producentow i {len(osoby_dict)} osob odpowiedzialnych.")

if __name__ == '__main__':
    main()
