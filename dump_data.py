import pandas as pd
import json

prod_df = pd.read_excel(r'C:\Users\Pracownik Biuro 1\Downloads\gpsr_producenci.xlsx')
osob_df = pd.read_excel(r'C:\Users\Pracownik Biuro 1\Downloads\gpsr_osoby.xlsx')

data = {
    "producenci": prod_df.iloc[:5].to_dict('records'),
    "osoby": osob_df.iloc[:5].to_dict('records')
}

with open('debug_data.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
