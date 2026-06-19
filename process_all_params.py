import pandas as pd
import csv
import glob
import re
import os

from process_excel_to_csv import parse_raw_string

def load_existing(filename):
    existing = {}
    if os.path.exists(filename):
        with open(filename, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f, delimiter=';')
            for row in reader:
                if 'internal_name' in row:
                    existing[row['internal_name']] = row
    return existing

def save_all(filename, data_dict, fieldnames):
    with open(filename, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
        writer.writeheader()
        for v in data_dict.values():
            writer.writerow(v)

def main():
    producenci_dict = load_existing('gpsr_producenci.csv')
    osoby_dict = load_existing('gpsr_osoby.csv')

    fieldnames = ['internal_name','producer_name','country_code','city','postal_code','street','email','phone_number','contact_form_url']
    fieldnames_osoby = ['internal_name','person_name','country_code','city','postal_code','street','email','phone_number','contact_form_url']

    # Mapowanie dla starszego wariantu kluczy
    def fix_keys(d, is_person):
        if is_person:
            return {
                'internal_name': d['internal_name'],
                'person_name': d['name'],
                'country_code': d['country_code'],
                'city': d['city'],
                'postal_code': d['postal_code'],
                'street': d['street'],
                'email': d['email'],
                'phone_number': d.get('phone_number', ''),
                'contact_form_url': d.get('contact_form_url', '')
            }
        else:
            return {
                'internal_name': d['internal_name'],
                'producer_name': d['name'],
                'country_code': d['country_code'],
                'city': d['city'],
                'postal_code': d['postal_code'],
                'street': d['street'],
                'email': d['email'],
                'phone_number': d.get('phone_number', ''),
                'contact_form_url': d.get('contact_form_url', '')
            }


    added_prod = 0
    added_osob = 0

    files = glob.glob('params_*.csv')
    for file in files:
        print(f"Przeszukuje: {file}")
        try:
            df = pd.read_csv(file, sep=';', dtype=str)
        except Exception as e:
            print("  Blad czytania:", e)
            continue
            
        prod_cols = []
        osob_cols = []
        
        for col in df.columns:
            cl = str(col).lower()
            if 'gpsr' in cl and 'adres' not in cl and 'email' not in cl and 'kraj' not in cl and 'miasto' not in cl and 'kod' not in cl:
                if 'osob' in cl or 'odpowiedzial' in cl:
                    osob_cols.append(col)
                else:
                    prod_cols.append(col)
            elif 'producent' in cl and 'kod' not in cl and 'nazwa' not in cl and 'oryginalne' not in cl and 'cz' not in cl and 'medycznego' not in cl:
                prod_cols.append(col)
            elif 'osoba' in cl and 'odpowiedzial' in cl:
                osob_cols.append(col)

        # Jesli uzytkownik mowil ze kolumna AC(28) i AI(34) ma sens, sprobujmy je tez wziac jesli maja sensowne dane (string z |)
        if len(df.columns) > 34:
            # AC = 28, AI = 34
            prod_cols.append(df.columns[28])
            osob_cols.append(df.columns[34])

        prod_cols = list(set(prod_cols))
        osob_cols = list(set(osob_cols))

        for col in prod_cols:
            for val in df[col].dropna().unique():
                if '|' in str(val):
                    parsed = parse_raw_string(str(val), is_person=False)
                    if parsed and parsed['internal_name'] not in producenci_dict:
                        producenci_dict[parsed['internal_name']] = fix_keys(parsed, False)
                        added_prod += 1

        for col in osob_cols:
            for val in df[col].dropna().unique():
                if '|' in str(val):
                    parsed = parse_raw_string(str(val), is_person=True)
                    if parsed and parsed['internal_name'] not in osoby_dict:
                        osoby_dict[parsed['internal_name']] = fix_keys(parsed, True)
                        added_osob += 1

    save_all('gpsr_producenci.csv', producenci_dict, fieldnames)
    save_all('gpsr_osoby.csv', osoby_dict, fieldnames_osoby)

    print(f"\nZakonczono! Dodano nowych producentow: {added_prod}, nowych osob: {added_osob}")

if __name__ == '__main__':
    main()
