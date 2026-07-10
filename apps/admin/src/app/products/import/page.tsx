'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, Upload, FileSpreadsheet, AlertCircle, CheckCircle2,
  X, Download, Eye, ChevronRight, RefreshCw
} from 'lucide-react';
import Link from 'next/link';
import { getAuthToken } from '@/lib/api';
import { useModal } from '@/components/ModalProvider';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

interface ParsedProduct {
  name: string;
  sku: string;
  price: number;
  stock: number;
  category?: string;
  description?: string;
  status?: string;
  isValid: boolean;
  errors: string[];
}

interface ImportResult {
  success: number;
  failed: number;
  errors: { row: number; error: string }[];
}

export default function ImportProductsPage() {
  const router = useRouter();
  const { alert } = useModal();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedProduct[]>([]);
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'result'>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState(0);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  }, []);

  const handleFileSelect = async (selectedFile: File) => {
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    const isCSV = selectedFile.name.endsWith('.csv');
    const isXLSX = selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls');
    
    if (!isCSV && !isXLSX && !allowedTypes.includes(selectedFile.type)) {
      await alert('Wybierz plik CSV lub Excel (xlsx, xls)');
      return;
    }
    
    setFile(selectedFile);
    parseFile(selectedFile);
  };

  const parseFile = async (file: File) => {
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      await alert('Plik jest pusty lub zawiera tylko naglowki');
      return;
    }
    
    // Parse header
    const delimiter = text.includes(';') ? ';' : ',';
    const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase().replace(/"/g, ''));
    
    // Map columns
    const columnMap: Record<string, number> = {};
    headers.forEach((header, index) => {
      if (header.includes('nazwa') || header === 'name') columnMap['name'] = index;
      if (header.includes('sku') || header === 'code') columnMap['sku'] = index;
      if (header.includes('cena') || header === 'price') columnMap['price'] = index;
      if (header.includes('stan') || header.includes('stock') || header.includes('ilosc')) columnMap['stock'] = index;
      if (header.includes('kategori') || header === 'category') columnMap['category'] = index;
      if (header.includes('opis') || header === 'description') columnMap['description'] = index;
      if (header.includes('status')) columnMap['status'] = index;
    });
    
    // Parse rows
    const products: ParsedProduct[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i], delimiter);
      const errors: string[] = [];
      
      const name = values[columnMap['name']] || '';
      const sku = values[columnMap['sku']] || '';
      const priceStr = values[columnMap['price']] || '0';
      const stockStr = values[columnMap['stock']] || '0';
      const category = values[columnMap['category']] || '';
      const description = values[columnMap['description']] || '';
      const status = values[columnMap['status']] || 'DRAFT';
      
      // Parse numbers
      const price = parseFloat(priceStr.replace(',', '.').replace(/[^\d.-]/g, ''));
      const stock = parseInt(stockStr.replace(/[^\d-]/g, ''), 10);
      
      // Validation
      if (!name) errors.push('Brak nazwy');
      if (!sku) errors.push('Brak SKU');
      if (isNaN(price) || price < 0) errors.push('Nieprawidlowa cena');
      if (isNaN(stock) || stock < 0) errors.push('Nieprawidlowy stan magazynowy');
      
      products.push({
        name,
        sku,
        price: isNaN(price) ? 0 : price,
        stock: isNaN(stock) ? 0 : stock,
        category,
        description,
        status,
        isValid: errors.length === 0,
        errors
      });
    }
    
    setParsedData(products);
    setStep('preview');
  };

  const parseCSVLine = (line: string, delimiter: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  };

  const handleImport = async () => {
    const validProducts = parsedData.filter(p => p.isValid);
    if (validProducts.length === 0) {
      await alert('Brak prawidlowych produktow do zaimportowania');
      return;
    }
    
    setStep('importing');
    setProgress(0);
    
    const results: ImportResult = {
      success: 0,
      failed: 0,
      errors: []
    };
    
    for (let i = 0; i < validProducts.length; i++) {
      const product = validProducts[i];
      
      try {
        const token = getAuthToken();
        const response = await fetch(`${API_URL}/products`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          body: JSON.stringify({
            name: product.name,
            sku: product.sku,
            slug: product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            price: product.price,
            stock: product.stock,
            description: product.description || '',
            status: product.status || 'DRAFT'
          })
        });
        
        if (response.ok) {
          results.success++;
        } else {
          results.failed++;
          results.errors.push({ row: i + 2, error: 'Blad serwera' });
        }
      } catch (error) {
        results.failed++;
        results.errors.push({ row: i + 2, error: String(error) });
      }
      
      setProgress(Math.round(((i + 1) / validProducts.length) * 100));
    }
    
    setImportResult(results);
    setStep('result');
  };

  const downloadTemplate = () => {
    const template = 'nazwa;sku;cena;stan;kategoria;opis;status\nPrzykladowy produkt;SKU-001;99.99;100;Elektronika;Opis produktu;DRAFT\n';
    const blob = new Blob(['\uFEFF' + template], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'szablon_produktow.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetImport = () => {
    setFile(null);
    setParsedData([]);
    setStep('upload');
    setImportResult(null);
    setProgress(0);
  };

  const validCount = parsedData.filter(p => p.isValid).length;
  const invalidCount = parsedData.filter(p => !p.isValid).length;

  const formatPrice = (price: number) => 
    new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(price);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/products" className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Import produktow</h1>
          <p className="text-gray-400">Importuj produkty z pliku CSV lub Excel</p>
        </div>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center justify-center gap-2">
        {['upload', 'preview', 'importing', 'result'].map((s, i) => (
          <div key={s} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-medium text-sm transition-colors ${
              step === s 
                ? 'bg-orange-500 text-white' 
                : ['upload', 'preview', 'importing', 'result'].indexOf(step) > i
                  ? 'bg-green-500 text-white'
                  : 'bg-slate-700 text-gray-400'
            }`}>
              {i + 1}
            </div>
            {i < 3 && <ChevronRight className="w-5 h-5 text-gray-600 mx-2" />}
          </div>
        ))}
      </div>

      {/* Step: Upload */}
      {step === 'upload' && (
        <div className="max-w-2xl mx-auto space-y-6">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
              isDragging 
                ? 'border-orange-500 bg-orange-500/10' 
                : 'border-slate-600 hover:border-orange-500/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              className="hidden"
            />
            <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragging ? 'text-orange-500' : 'text-gray-500'}`} />
            <p className="text-lg text-white mb-2">
              Przeciagnij plik lub kliknij aby wybrac
            </p>
            <p className="text-sm text-gray-400">
              Obslugiwane formaty: CSV, XLSX, XLS
            </p>
          </div>

          <div className="flex items-center justify-center gap-4">
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 text-gray-300 rounded-lg hover:bg-slate-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Pobierz szablon CSV
            </button>
          </div>

          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <h3 className="font-medium text-white mb-4 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              Wymagane kolumny
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-400">Obowiazkowe:</p>
                <ul className="mt-2 space-y-1 text-gray-300">
                  <li>• <code className="bg-slate-700 px-1 rounded">nazwa</code> - Nazwa produktu</li>
                  <li>• <code className="bg-slate-700 px-1 rounded">sku</code> - Kod produktu</li>
                  <li>• <code className="bg-slate-700 px-1 rounded">cena</code> - Cena w PLN</li>
                  <li>• <code className="bg-slate-700 px-1 rounded">stan</code> - Stan magazynowy</li>
                </ul>
              </div>
              <div>
                <p className="text-gray-400">Opcjonalne:</p>
                <ul className="mt-2 space-y-1 text-gray-300">
                  <li>• <code className="bg-slate-700 px-1 rounded">kategoria</code> - Nazwa kategorii</li>
                  <li>• <code className="bg-slate-700 px-1 rounded">opis</code> - Opis produktu</li>
                  <li>• <code className="bg-slate-700 px-1 rounded">status</code> - ACTIVE/DRAFT/ARCHIVED</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step: Preview */}
      {step === 'preview' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-slate-800 rounded-lg">
                <FileSpreadsheet className="w-6 h-6 text-orange-500" />
              </div>
              <div>
                <p className="text-white font-medium">{file?.name}</p>
                <p className="text-sm text-gray-400">{parsedData.length} produktow znaleziono</p>
              </div>
            </div>
            <button
              onClick={resetImport}
              className="flex items-center gap-2 px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Wybierz inny plik
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
                <div>
                  <p className="text-2xl font-bold text-green-400">{validCount}</p>
                  <p className="text-sm text-green-300">Prawidlowe produkty</p>
                </div>
              </div>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-6 h-6 text-red-500" />
                <div>
                  <p className="text-2xl font-bold text-red-400">{invalidCount}</p>
                  <p className="text-sm text-red-300">Bledy walidacji</p>
                </div>
              </div>
            </div>
          </div>

          {/* Preview table */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="overflow-x-auto max-h-96">
              <table className="w-full">
                <thead className="bg-slate-900 sticky top-0">
                  <tr className="text-left text-xs text-gray-400 uppercase">
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Nazwa</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Cena</th>
                    <th className="px-4 py-3">Stan</th>
                    <th className="px-4 py-3">Bledy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {parsedData.map((product, i) => (
                    <tr key={i} className={product.isValid ? '' : 'bg-red-500/5'}>
                      <td className="px-4 py-3">
                        {product.isValid ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-red-500" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-white">{product.name || '-'}</td>
                      <td className="px-4 py-3 text-gray-400 font-mono text-sm">{product.sku || '-'}</td>
                      <td className="px-4 py-3 text-white">{formatPrice(product.price)}</td>
                      <td className="px-4 py-3 text-gray-300">{product.stock} szt.</td>
                      <td className="px-4 py-3">
                        {product.errors.length > 0 && (
                          <span className="text-sm text-red-400">
                            {product.errors.join(', ')}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-4">
            <button
              onClick={resetImport}
              className="px-6 py-2 border border-slate-600 text-gray-300 rounded-lg hover:bg-slate-700 transition-colors"
            >
              Anuluj
            </button>
            <button
              onClick={handleImport}
              disabled={validCount === 0}
              className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Importuj {validCount} produktow
            </button>
          </div>
        </div>
      )}

      {/* Step: Importing */}
      {step === 'importing' && (
        <div className="max-w-md mx-auto text-center py-12">
          <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
          <p className="text-xl text-white mb-4">Importowanie produktow...</p>
          <div className="w-full bg-slate-700 rounded-full h-3 mb-2">
            <div 
              className="bg-orange-500 h-3 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="text-gray-400">{progress}%</p>
        </div>
      )}

      {/* Step: Result */}
      {step === 'result' && importResult && (
        <div className="max-w-md mx-auto text-center py-8">
          {importResult.success > 0 ? (
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          ) : (
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          )}
          
          <h2 className="text-2xl font-bold text-white mb-2">
            Import zakonczony
          </h2>
          
          <div className="flex justify-center gap-8 my-6">
            <div>
              <p className="text-3xl font-bold text-green-400">{importResult.success}</p>
              <p className="text-sm text-gray-400">Zaimportowano</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-red-400">{importResult.failed}</p>
              <p className="text-sm text-gray-400">Bledy</p>
            </div>
          </div>

          {importResult.errors.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-left mb-6">
              <p className="text-red-400 font-medium mb-2">Bledy importu:</p>
              <ul className="text-sm text-red-300 space-y-1">
                {importResult.errors.slice(0, 5).map((err, i) => (
                  <li key={i}>Wiersz {err.row}: {err.error}</li>
                ))}
                {importResult.errors.length > 5 && (
                  <li>...i {importResult.errors.length - 5} wiecej</li>
                )}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-center gap-4">
            <button
              onClick={resetImport}
              className="px-6 py-2 border border-slate-600 text-gray-300 rounded-lg hover:bg-slate-700 transition-colors"
            >
              Importuj wiecej
            </button>
            <Link
              href="/products"
              className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
            >
              Lista produktow
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
