'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getAuthToken } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { useModal } from '@/components/ModalProvider';
import {
  Mail,
  Plus,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Save,
  X,
  Ticket,
  Info,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  AlertTriangle,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

interface EmailTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  subject: string;
  content: string;
  category: string;
  includesDiscount: boolean;
  discountPercent: number | null;
  discountValidDays: number | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface Placeholder {
  key: string;
  description: string;
  example: string;
}

const EMPTY_FORM = {
  slug: '',
  name: '',
  description: '',
  subject: '',
  content: '',
  category: 'DELIVERY_DELAY',
  includesDiscount: false,
  discountPercent: '',
  discountValidDays: '',
  isActive: true,
  sortOrder: '0',
};

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [placeholders, setPlaceholders] = useState<Placeholder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [showPlaceholders, setShowPlaceholders] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const { success, error: toastError } = useToast();
  const { confirm } = useModal();

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/admin/email-templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates);
      }
    } catch (e) {
      console.error('Failed to fetch templates:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPlaceholders = useCallback(async () => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/admin/email-templates/placeholders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPlaceholders(data.placeholders);
      }
    } catch (e) {
      console.error('Failed to fetch placeholders:', e);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
    fetchPlaceholders();
  }, [fetchTemplates, fetchPlaceholders]);

  const openCreate = () => {
    setEditingTemplate(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  };

  const openEdit = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setForm({
      slug: template.slug,
      name: template.name,
      description: template.description || '',
      subject: template.subject,
      content: template.content,
      category: template.category,
      includesDiscount: template.includesDiscount,
      discountPercent: template.discountPercent?.toString() || '',
      discountValidDays: template.discountValidDays?.toString() || '',
      isActive: template.isActive,
      sortOrder: template.sortOrder.toString(),
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.subject.trim() || !form.content.trim()) {
      toastError('Brakujące pola', 'Nazwa, temat i treść są wymagane');
      return;
    }
    if (!editingTemplate && !form.slug.trim()) {
      toastError('Brakujące pole', 'Slug jest wymagany');
      return;
    }

    try {
      setSaving(true);
      const token = getAuthToken();

      const body: Record<string, unknown> = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        subject: form.subject.trim(),
        content: form.content,
        category: form.category,
        includesDiscount: form.includesDiscount,
        discountPercent: form.includesDiscount ? parseInt(form.discountPercent) || null : null,
        discountValidDays: form.includesDiscount ? parseInt(form.discountValidDays) || null : null,
        isActive: form.isActive,
        sortOrder: parseInt(form.sortOrder) || 0,
      };

      if (!editingTemplate) {
        body.slug = form.slug.trim();
      }

      const url = editingTemplate
        ? `${API_URL}/admin/email-templates/${editingTemplate.id}`
        : `${API_URL}/admin/email-templates`;
      const method = editingTemplate ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (res.ok) {
        success(editingTemplate ? 'Szablon zaktualizowany' : 'Szablon utworzony', form.name);
        setShowModal(false);
        fetchTemplates();
      } else {
        toastError('Błąd', data.message || 'Nie udało się zapisać szablonu');
      }
    } catch (e) {
      toastError('Błąd', 'Nie udało się zapisać szablonu');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (template: EmailTemplate) => {
    const confirmed = await confirm({
      message: `Czy na pewno chcesz usunąć szablon "${template.name}"?`,
      confirmText: 'Usuń',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/admin/email-templates/${template.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        success('Szablon usunięty', template.name);
        fetchTemplates();
      } else {
        const data = await res.json();
        toastError('Błąd', data.message || 'Nie udało się usunąć szablonu');
      }
    } catch (e) {
      toastError('Błąd', 'Nie udało się usunąć szablonu');
    }
  };

  const copyPlaceholder = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[ąàáâãäå]/g, 'a').replace(/[ćčç]/g, 'c').replace(/[ęèéêë]/g, 'e')
      .replace(/[łĺľ]/g, 'l').replace(/[ńñ]/g, 'n').replace(/[óòôõö]/g, 'o')
      .replace(/[śšß]/g, 's').replace(/[ùúûü]/g, 'u').replace(/[źżž]/g, 'z')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
  };

  const getSamplePreview = (content: string) => {
    return content
      .replace(/\{orderNumber\}/g, 'WB-20260414-001')
      .replace(/\{customerName\}/g, 'Jan Kowalski')
      .replace(/\{discountCode\}/g, '10-K3BN7WHP')
      .replace(/\{discountPercent\}/g, '10')
      .replace(/\{discountExpiry\}/g, '14.05.2026');
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-violet-500/20 rounded-lg flex items-center justify-center">
            <Mail className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Szablony e-mail</h1>
            <p className="text-sm text-slate-400">
              Zarządzaj szablonami wiadomości e-mail wysyłanych do klientów
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPlaceholders(!showPlaceholders)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm text-slate-300 transition-colors"
          >
            <Info className="w-4 h-4" />
            Placeholdery
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nowy szablon
          </button>
        </div>
      </div>

      {/* Placeholders Reference Panel */}
      {showPlaceholders && (
        <div className="mb-6 bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-400" />
            Dostępne zmienne (placeholdery)
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            Wstaw te zmienne w treści szablonu — zostaną automatycznie zamienione na wartości konkretnego zamówienia podczas wysyłki.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {placeholders.map((p) => (
              <div
                key={p.key}
                className="flex items-center justify-between gap-2 p-2.5 bg-slate-700/50 rounded-lg group"
              >
                <div className="min-w-0 flex-1">
                  <code className="text-xs font-mono text-orange-400">{p.key}</code>
                  <div className="text-[10px] text-slate-400 mt-0.5">{p.description}</div>
                  <div className="text-[10px] text-slate-500">np. {p.example}</div>
                </div>
                <button
                  onClick={() => copyPlaceholder(p.key)}
                  className="p-1 rounded hover:bg-slate-600 text-slate-400 transition-colors shrink-0"
                  title="Kopiuj"
                >
                  {copiedKey === p.key ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Templates List */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Ładowanie...</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 bg-slate-800/30 rounded-xl border border-slate-700">
          <Mail className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-white font-medium">Brak szablonów</p>
          <p className="text-sm text-slate-400 mt-1">Utwórz pierwszy szablon e-mail</p>
          <button
            onClick={openCreate}
            className="mt-4 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4 inline mr-1" />
            Utwórz szablon
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((template) => (
            <div
              key={template.id}
              className={`bg-slate-800/50 border rounded-xl overflow-hidden transition-all ${
                template.isActive ? 'border-slate-700' : 'border-slate-700/50 opacity-60'
              }`}
            >
              {/* Template Header */}
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    template.includesDiscount ? 'bg-green-500/20' : 'bg-violet-500/20'
                  }`}>
                    {template.includesDiscount ? <Ticket className="w-4 h-4 text-green-400" /> : <Mail className="w-4 h-4 text-violet-400" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-white truncate">{template.name}</h3>
                      {!template.isActive && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-600/50 text-slate-400">Nieaktywny</span>
                      )}
                      {template.includesDiscount && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/20 text-green-400">
                          -{template.discountPercent}% rabat · {template.discountValidDays} dni
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{template.description || template.subject}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-3">
                  <button
                    onClick={() => setPreviewId(previewId === template.id ? null : template.id)}
                    className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                    title="Podgląd"
                  >
                    {previewId === template.id ? <ChevronUp className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => openEdit(template)}
                    className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                    title="Edytuj"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(template)}
                    className="p-2 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                    title="Usuń"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Preview */}
              {previewId === template.id && (
                <div className="px-5 pb-4 border-t border-slate-700/50">
                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-400 mb-2">
                    <Eye className="w-3 h-3" />
                    Podgląd z przykładowymi danymi
                  </div>
                  <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700 text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {getSamplePreview(template.content)}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-500">
                    <span>Slug: <code className="text-slate-400">{template.slug}</code></span>
                    <span>Kategoria: <code className="text-slate-400">{template.category}</code></span>
                    <span>Kolejność: <code className="text-slate-400">{template.sortOrder}</code></span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60" onClick={() => setShowModal(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-3xl relative flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-3 right-3 z-10 p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="overflow-y-auto flex-1 min-h-0">
              {/* Modal Header */}
              <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-700">
                <div className="w-9 h-9 bg-violet-500/20 rounded-lg flex items-center justify-center">
                  <Mail className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    {editingTemplate ? 'Edytuj szablon' : 'Nowy szablon'}
                  </h2>
                  <p className="text-sm text-slate-400">
                    {editingTemplate ? editingTemplate.name : 'Utwórz nowy szablon wiadomości e-mail'}
                  </p>
                </div>
              </div>

              {/* Form */}
              <div className="px-6 py-4 space-y-4">
                {/* Name + Slug */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Nazwa szablonu *</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        setForm((prev) => ({
                          ...prev,
                          name,
                          ...(!editingTemplate && !prev.slug ? { slug: generateSlug(name) } : {}),
                        }));
                      }}
                      placeholder="np. Przeprosiny z rabatem"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:ring-orange-500 focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Slug {editingTemplate ? '(tylko do odczytu)' : '*'}
                    </label>
                    <input
                      type="text"
                      value={form.slug}
                      onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                      disabled={!!editingTemplate}
                      placeholder="np. delay-apology-with-discount"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:ring-orange-500 focus:border-orange-500 disabled:opacity-50 disabled:cursor-not-allowed font-mono text-xs"
                    />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Opis (widoczny w panelu)</label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="np. Empatyczna wiadomość z unikalnym kodem rabatowym"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>

                {/* Subject */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Temat e-mail *</label>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
                    placeholder="np. Informacja o zamówieniu #{orderNumber} — WBTrade"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>

                {/* Content */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-slate-400">Treść wiadomości *</label>
                    <div className="flex items-center gap-1 text-[10px] text-slate-500">
                      {placeholders.map((p) => (
                        <button
                          key={p.key}
                          onClick={() => {
                            const textarea = document.getElementById('template-content') as HTMLTextAreaElement;
                            if (textarea) {
                              const start = textarea.selectionStart;
                              const end = textarea.selectionEnd;
                              const newContent = form.content.slice(0, start) + p.key + form.content.slice(end);
                              setForm((prev) => ({ ...prev, content: newContent }));
                              setTimeout(() => {
                                textarea.focus();
                                textarea.setSelectionRange(start + p.key.length, start + p.key.length);
                              }, 0);
                            }
                          }}
                          className="px-1.5 py-0.5 rounded bg-slate-700/50 hover:bg-slate-600 text-orange-400 font-mono transition-colors"
                          title={p.description}
                        >
                          {p.key}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    id="template-content"
                    value={form.content}
                    onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                    placeholder="Wpisz treść szablonu...&#10;&#10;Użyj {orderNumber}, {customerName}, {discountCode} itp."
                    rows={12}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:ring-orange-500 focus:border-orange-500 resize-none font-mono leading-relaxed"
                  />
                </div>

                {/* Discount Section */}
                <div className={`p-4 rounded-xl border transition-all ${
                  form.includesDiscount ? 'border-green-500/40 bg-green-500/5' : 'border-slate-700 bg-slate-800/30'
                }`}>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.includesDiscount}
                      onChange={(e) => setForm((prev) => ({ ...prev, includesDiscount: e.target.checked }))}
                      className="accent-green-500 w-4 h-4 rounded"
                    />
                    <div>
                      <div className="text-sm font-medium text-white flex items-center gap-2">
                        <Ticket className="w-4 h-4 text-green-400" />
                        Generuj unikalny kod rabatowy
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Automatycznie wygeneruje jednorazowy kod rabatowy dla każdego klienta
                      </div>
                    </div>
                  </label>

                  {form.includesDiscount && (
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Procent zniżki (%)</label>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={form.discountPercent}
                          onChange={(e) => setForm((prev) => ({ ...prev, discountPercent: e.target.value }))}
                          placeholder="np. 10"
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:ring-green-500 focus:border-green-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Ważność kodu (dni)</label>
                        <input
                          type="number"
                          min="1"
                          max="365"
                          value={form.discountValidDays}
                          onChange={(e) => setForm((prev) => ({ ...prev, discountValidDays: e.target.value }))}
                          placeholder="np. 30"
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:ring-green-500 focus:border-green-500"
                        />
                      </div>
                      <div className="col-span-2 flex items-start gap-2 p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                        <AlertTriangle className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                        <div className="text-xs text-slate-300">
                          Użyj <code className="text-green-400 font-mono">{'{discountCode}'}</code>, <code className="text-green-400 font-mono">{'{discountPercent}'}</code> i <code className="text-green-400 font-mono">{'{discountExpiry}'}</code> w treści szablonu.
                          Kod będzie w formacie np. <strong className="text-white">10-K3BN7WHP</strong> (jednorazowy, unikalny).
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Active + Sort Order */}
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                      className="accent-orange-500 w-4 h-4 rounded"
                    />
                    <span className="text-sm text-white">Aktywny</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-slate-400">Kolejność</label>
                    <input
                      type="number"
                      min="0"
                      value={form.sortOrder}
                      onChange={(e) => setForm((prev) => ({ ...prev, sortOrder: e.target.value }))}
                      className="w-16 px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white text-center focus:ring-orange-500 focus:border-orange-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700 shrink-0">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm text-slate-300 transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Zapisuję...' : editingTemplate ? 'Zapisz zmiany' : 'Utwórz szablon'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
