'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Send, Clock, CheckCircle, XCircle, User, ShieldCheck,
  AlertCircle, Package, RotateCcw, PackageCheck, Ban, DollarSign,
  MessageSquare, ChevronDown, X,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://wbtradeprod.onrender.com/api' : 'http://localhost:5000/api');

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  const tokens = localStorage.getItem('admin_auth_tokens');
  if (!tokens) return null;
  try {
    return JSON.parse(tokens).accessToken;
  } catch {
    return null;
  }
}

interface Message {
  id: string;
  senderId: string | null;
  senderRole: 'CUSTOMER' | 'ADMIN' | 'SYSTEM';
  content: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

interface ReturnDetail {
  id: string;
  returnNumber: string;
  status: string;
  type: string;
  reason: string;
  refundAmount: number | null;
  refundDate: string | null;
  adminNotes: string | null;
  rejectionReason: string | null;
  closedAt: string | null;
  closedBy: string | null;
  createdAt: string;
  updatedAt: string;
  items: {
    id: string;
    quantity: number;
    reason: string | null;
    orderItem: {
      id: string;
      productName: string;
      variantName: string;
      quantity: number;
      unitPrice: number;
      image?: string | null;
    };
  }[];
  ticket: {
    id: string;
    ticketNumber: string;
    subject: string;
    status: string;
    guestEmail: string | null;
    guestName: string | null;
    guestPhone: string | null;
    user: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    } | null;
    messages: Message[];
  };
  order: {
    id: string;
    orderNumber: string;
    total: number;
    createdAt: string;
  };
}

const STATUS_STEPS = ['NEW', 'RECEIVED', 'APPROVED', 'REFUND_SENT', 'CLOSED'];

const statusLabels: Record<string, string> = {
  NEW: 'Nowy',
  RECEIVED: 'Przyjęty',
  APPROVED: 'Zaakceptowany',
  REFUND_SENT: 'Zwrot wysłany',
  CLOSED: 'Zamknięty',
  REJECTED: 'Odrzucony',
};

const statusColors: Record<string, string> = {
  NEW: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  RECEIVED: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  APPROVED: 'bg-green-500/20 text-green-400 border-green-500/30',
  REFUND_SENT: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  CLOSED: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  REJECTED: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const typeLabels: Record<string, string> = {
  RETURN: 'Zwrot',
  COMPLAINT: 'Reklamacja',
};

export default function ReturnDetailPage() {
  const params = useParams();
  const router = useRouter();
  const returnId = params.id as string;

  const [returnData, setReturnData] = useState<ReturnDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Approve modal
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approveAmount, setApproveAmount] = useState('');

  // Reject modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef<number>(0);
  const isInitialLoadRef = useRef<boolean>(true);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const authHeaders = () => {
    const token = getAuthToken();
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  };

  const loadReturn = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/returns/${returnId}`, { headers: authHeaders() });
      if (res.ok) {
        setReturnData(await res.json());
      } else if (res.status === 404) {
        router.push('/returns');
      }
    } catch (error) {
      console.error('Failed to load return:', error);
    } finally {
      setLoading(false);
    }
  }, [returnId, router]);

  useEffect(() => { loadReturn(); }, [loadReturn]);

  // Polling for live chat
  useEffect(() => {
    const interval = setInterval(loadReturn, 5000);
    return () => clearInterval(interval);
  }, [loadReturn]);

  // Scroll handling for messages
  useEffect(() => {
    const messageCount = returnData?.ticket?.messages?.length || 0;
    if (messageCount === 0) return;
    const container = messagesContainerRef.current;
    if (isInitialLoadRef.current) {
      if (container) container.scrollTop = container.scrollHeight;
      isInitialLoadRef.current = false;
      prevMessageCountRef.current = messageCount;
      return;
    }
    if (messageCount > prevMessageCountRef.current && container) {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distanceFromBottom < 150) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      }
    }
    prevMessageCountRef.current = messageCount;
  }, [returnData?.ticket?.messages]);

  const handleSendReply = async () => {
    if (!replyText.trim() || sending) return;
    try {
      setSending(true);
      const res = await fetch(`${API_URL}/admin/returns/${returnId}/messages`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ content: replyText }),
      });
      if (res.ok) {
        setReplyText('');
        await loadReturn();
      }
    } catch (error) {
      console.error('Failed to send reply:', error);
    } finally {
      setSending(false);
    }
  };

  const handleAction = async (action: string, body?: any) => {
    setActionLoading(true);
    try {
      const method = action === 'status' ? 'PATCH' : 'POST';
      const res = await fetch(`${API_URL}/admin/returns/${returnId}/${action}`, {
        method,
        headers: authHeaders(),
        body: JSON.stringify(body || {}),
      });
      if (res.ok) {
        showToast('Akcja wykonana pomyślnie');
        await loadReturn();
      } else {
        const data = await res.json();
        showToast(data.error || 'Błąd', 'error');
      }
    } catch {
      showToast('Błąd połączenia', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async () => {
    const amount = parseFloat(approveAmount);
    if (isNaN(amount) || amount <= 0) {
      showToast('Podaj prawidłową kwotę zwrotu', 'error');
      return;
    }
    setShowApproveModal(false);
    await handleAction('approve', { refundAmount: amount });
    setApproveAmount('');
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      showToast('Podaj powód odrzucenia', 'error');
      return;
    }
    setShowRejectModal(false);
    await handleAction('reject', { rejectionReason: rejectReason });
    setRejectReason('');
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pl-PL', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDay = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'Dziś';
    if (date.toDateString() === yesterday.toDateString()) return 'Wczoraj';
    return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-slate-700 rounded animate-pulse w-48" />
        <div className="h-64 bg-slate-800/50 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!returnData) {
    return (
      <div className="text-center py-12">
        <RotateCcw className="w-12 h-12 mx-auto mb-4 text-gray-600" />
        <p className="text-gray-400">Nie znaleziono zwrotu</p>
        <Link href="/returns" className="text-orange-400 hover:text-orange-300 mt-2 inline-block">Wróć do listy</Link>
      </div>
    );
  }

  const r = returnData;
  const customerName = r.ticket.user
    ? `${r.ticket.user.firstName} ${r.ticket.user.lastName}`
    : r.ticket.guestName || r.ticket.guestEmail || 'Gość';

  const itemsValue = r.items.reduce((sum, item) => sum + Number(item.orderItem.unitPrice) * item.quantity, 0);

  // Group messages by day
  const messages = r.ticket.messages || [];
  const messagesByDay: { day: string; messages: Message[] }[] = [];
  let currentDay = '';
  for (const msg of messages) {
    const day = new Date(msg.createdAt).toDateString();
    if (day !== currentDay) {
      currentDay = day;
      messagesByDay.push({ day: msg.createdAt, messages: [msg] });
    } else {
      messagesByDay[messagesByDay.length - 1].messages.push(msg);
    }
  }

  // Status stepper
  const isRejected = r.status === 'REJECTED';
  const currentStepIndex = isRejected ? -1 : STATUS_STEPS.indexOf(r.status);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg border transition-all duration-300 ${
          toast.type === 'success' ? 'bg-green-500/20 border-green-500/30 text-green-400' : 'bg-red-500/20 border-red-500/30 text-red-400'
        }`}>
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span className="text-sm font-medium">{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-2 hover:opacity-70"><X className="w-3 h-3" /></button>
          </div>
        </div>
      )}

      {/* Approve Modal */}
      {showApproveModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">Zaakceptuj zwrot</h3>
            <p className="text-gray-400 text-sm mb-4">
              Wartość produktów: <span className="text-white font-medium">{itemsValue.toFixed(2)} zł</span>
            </p>
            <label className="block text-sm text-gray-400 mb-2">Kwota zwrotu (zł)</label>
            <input type="number" step="0.01" value={approveAmount}
              onChange={(e) => setApproveAmount(e.target.value)}
              placeholder={itemsValue.toFixed(2)}
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500 mb-4" />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowApproveModal(false)}
                className="px-4 py-2 bg-slate-700 text-gray-300 rounded-lg hover:bg-slate-600 transition-colors">Anuluj</button>
              <button onClick={handleApprove} disabled={actionLoading}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-colors disabled:opacity-50">
                Zaakceptuj
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">Odrzuć zwrot</h3>
            <label className="block text-sm text-gray-400 mb-2">Powód odrzucenia</label>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              rows={3} placeholder="Podaj powód odrzucenia..."
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none mb-4" />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 bg-slate-700 text-gray-300 rounded-lg hover:bg-slate-600 transition-colors">Anuluj</button>
              <button onClick={handleReject} disabled={actionLoading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors disabled:opacity-50">
                Odrzuć
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/returns" className="p-2 bg-slate-800 rounded-lg text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-white">{r.returnNumber}</h1>
            <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium border ${statusColors[r.status]}`}>
              {statusLabels[r.status]}
            </span>
            <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
              r.type === 'RETURN' ? 'bg-orange-500/20 text-orange-400' : 'bg-red-500/20 text-red-400'
            }`}>
              {typeLabels[r.type] || r.type}
            </span>
          </div>
          <p className="text-gray-400 text-sm mt-1">{r.reason}</p>
        </div>
      </div>

      {/* Status Stepper */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
        {isRejected ? (
          <div className="flex items-center justify-center gap-3 text-red-400">
            <Ban className="w-6 h-6" />
            <div>
              <p className="font-semibold">Zwrot odrzucony</p>
              {r.rejectionReason && <p className="text-sm text-red-400/70 mt-1">Powód: {r.rejectionReason}</p>}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            {STATUS_STEPS.map((step, i) => {
              const isActive = i === currentStepIndex;
              const isCompleted = i < currentStepIndex;
              const isFuture = i > currentStepIndex;

              return (
                <div key={step} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                      isCompleted ? 'bg-green-500/20 border-green-500 text-green-400' :
                      isActive ? 'bg-orange-500/20 border-orange-500 text-orange-400 ring-4 ring-orange-500/20' :
                      'bg-slate-700/50 border-slate-600 text-gray-500'
                    }`}>
                      {isCompleted ? <CheckCircle className="w-5 h-5" /> : (
                        <span className="text-xs font-bold">{i + 1}</span>
                      )}
                    </div>
                    <span className={`text-xs mt-2 font-medium ${
                      isActive ? 'text-orange-400' : isCompleted ? 'text-green-400' : 'text-gray-500'
                    }`}>
                      {statusLabels[step]}
                    </span>
                  </div>
                  {i < STATUS_STEPS.length - 1 && (
                    <div className={`h-0.5 flex-1 mx-2 transition-all duration-300 ${
                      isCompleted ? 'bg-green-500' : 'bg-slate-700'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        {r.status === 'NEW' && (
          <>
            <button onClick={() => handleAction('status', { status: 'RECEIVED' })} disabled={actionLoading}
              className="px-4 py-2.5 bg-yellow-600/20 border border-yellow-600/30 text-yellow-400 rounded-xl hover:bg-yellow-600/30 transition-all disabled:opacity-50 flex items-center gap-2 font-medium">
              <PackageCheck className="w-4 h-4" /> Oznacz jako przyjęty
            </button>
            <button onClick={() => setShowRejectModal(true)}
              className="px-4 py-2.5 bg-red-600/20 border border-red-600/30 text-red-400 rounded-xl hover:bg-red-600/30 transition-all flex items-center gap-2 font-medium">
              <Ban className="w-4 h-4" /> Odrzuć
            </button>
          </>
        )}
        {r.status === 'RECEIVED' && (
          <>
            <button onClick={() => { setApproveAmount(itemsValue.toFixed(2)); setShowApproveModal(true); }}
              className="px-4 py-2.5 bg-green-600/20 border border-green-600/30 text-green-400 rounded-xl hover:bg-green-600/30 transition-all flex items-center gap-2 font-medium">
              <CheckCircle className="w-4 h-4" /> Zaakceptuj zwrot
            </button>
            <button onClick={() => setShowRejectModal(true)}
              className="px-4 py-2.5 bg-red-600/20 border border-red-600/30 text-red-400 rounded-xl hover:bg-red-600/30 transition-all flex items-center gap-2 font-medium">
              <Ban className="w-4 h-4" /> Odrzuć
            </button>
          </>
        )}
        {r.status === 'APPROVED' && (
          <button onClick={() => handleAction('refund-sent')} disabled={actionLoading}
            className="px-4 py-2.5 bg-emerald-600/20 border border-emerald-600/30 text-emerald-400 rounded-xl hover:bg-emerald-600/30 transition-all disabled:opacity-50 flex items-center gap-2 font-medium">
            <DollarSign className="w-4 h-4" /> Oznacz przelew jako wysłany
          </button>
        )}
        {r.status === 'REFUND_SENT' && (
          <button onClick={() => handleAction('close')} disabled={actionLoading}
            className="px-4 py-2.5 bg-gray-600/20 border border-gray-600/30 text-gray-400 rounded-xl hover:bg-gray-600/30 transition-all disabled:opacity-50 flex items-center gap-2 font-medium">
            <CheckCircle className="w-4 h-4" /> Zamknij zwrot
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Returned Items */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-700/50">
              <h3 className="text-sm font-semibold text-gray-400 uppercase flex items-center gap-2">
                <Package className="w-4 h-4" /> Zwracane produkty ({r.items.length})
              </h3>
            </div>
            <div className="divide-y divide-slate-700/50">
              {r.items.map((item) => (
                <div key={item.id} className="px-6 py-4 flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-700/50 rounded-lg flex items-center justify-center flex-shrink-0">
                    {item.orderItem.image ? (
                      <img src={item.orderItem.image} alt="" className="w-12 h-12 object-cover rounded-lg" />
                    ) : (
                      <Package className="w-5 h-5 text-gray-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{item.orderItem.productName}</p>
                    {item.orderItem.variantName && (
                      <p className="text-gray-400 text-xs">{item.orderItem.variantName}</p>
                    )}
                    {item.reason && (
                      <p className="text-gray-500 text-xs mt-1">Powód: {item.reason}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-white text-sm font-medium">{(Number(item.orderItem.unitPrice) * item.quantity).toFixed(2)} zł</p>
                    <p className="text-gray-400 text-xs">{item.quantity} × {Number(item.orderItem.unitPrice).toFixed(2)} zł</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-slate-700/50 bg-slate-800/30 flex items-center justify-between">
              <span className="text-gray-400 text-sm">Wartość zwrotu</span>
              <span className="text-white font-bold text-lg">{itemsValue.toFixed(2)} zł</span>
            </div>
          </div>

          {/* Refund Info (if approved) */}
          {(r.refundAmount || r.refundDate) && (
            <div className="bg-slate-800/50 rounded-xl border border-emerald-500/30 p-6">
              <h3 className="text-sm font-semibold text-emerald-400 uppercase flex items-center gap-2 mb-4">
                <DollarSign className="w-4 h-4" /> Informacje o zwrocie środków
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {r.refundAmount && (
                  <div>
                    <p className="text-xs text-gray-500">Kwota zwrotu</p>
                    <p className="text-emerald-400 text-xl font-bold">{Number(r.refundAmount).toFixed(2)} zł</p>
                  </div>
                )}
                {r.refundDate && (
                  <div>
                    <p className="text-xs text-gray-500">Data wysłania przelewu</p>
                    <p className="text-white text-sm font-medium">{formatDate(r.refundDate)}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Messages Thread */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-700/50">
              <h3 className="text-sm font-semibold text-gray-400 uppercase flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> Wiadomości ({messages.length})
              </h3>
            </div>

            <div ref={messagesContainerRef} className="p-6 space-y-6 max-h-[500px] overflow-y-auto">
              {messagesByDay.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Brak wiadomości</p>
              ) : messagesByDay.map((group, gi) => (
                <div key={gi}>
                  <div className="flex items-center gap-4 my-4">
                    <div className="flex-1 h-px bg-slate-700" />
                    <span className="text-xs text-gray-500 uppercase">{formatDay(group.day)}</span>
                    <div className="flex-1 h-px bg-slate-700" />
                  </div>
                  <div className="space-y-4">
                    {group.messages.map((msg) => {
                      if (msg.senderRole === 'SYSTEM') {
                        return (
                          <div key={msg.id} className="flex justify-center">
                            <div className="bg-slate-700/50 rounded-lg px-4 py-2 text-xs text-gray-400 italic flex items-center gap-2">
                              <AlertCircle className="w-3 h-3" />
                              {msg.content}
                              <span className="text-gray-600 ml-2">{formatTime(msg.createdAt)}</span>
                            </div>
                          </div>
                        );
                      }
                      const isAdmin = msg.senderRole === 'ADMIN';
                      return (
                        <div key={msg.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                          <div className="max-w-[75%]">
                            <div className="flex items-center gap-2 mb-1">
                              {!isAdmin && (
                                <>
                                  <User className="w-3 h-3 text-blue-400" />
                                  <span className="text-xs text-blue-400">{customerName}</span>
                                </>
                              )}
                              {isAdmin && (
                                <>
                                  <ShieldCheck className="w-3 h-3 text-orange-400" />
                                  <span className="text-xs text-orange-400">Admin</span>
                                </>
                              )}
                              <span className="text-xs text-gray-600">{formatTime(msg.createdAt)}</span>
                            </div>
                            <div className={`rounded-xl px-4 py-3 ${
                              isAdmin
                                ? 'bg-orange-500/20 border border-orange-500/30 text-white'
                                : 'bg-slate-700/50 border border-slate-600/50 text-gray-200'
                            }`}>
                              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                            </div>
                            {isAdmin && msg.isRead && (
                              <p className="text-xs text-gray-600 mt-1 text-right flex items-center justify-end gap-1">
                                <CheckCircle className="w-3 h-3" /> Przeczytane
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Reply Input */}
            {r.status !== 'CLOSED' && r.status !== 'REJECTED' ? (
              <div className="border-t border-slate-700 p-4">
                <div className="flex gap-3">
                  <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Napisz odpowiedź..." rows={3}
                    className="flex-1 px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                    onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleSendReply(); }} />
                  <button onClick={handleSendReply} disabled={!replyText.trim() || sending}
                    className="px-4 py-3 bg-orange-500 rounded-xl text-white hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 self-end">
                    <Send className="w-4 h-4" />
                    {sending ? 'Wysyłanie...' : 'Wyślij'}
                  </button>
                </div>
                <p className="text-xs text-gray-600 mt-2">Ctrl+Enter aby wysłać</p>
              </div>
            ) : (
              <div className="border-t border-slate-700 p-4 text-center">
                <p className="text-gray-500 text-sm">
                  Zgłoszenie zostało {r.status === 'REJECTED' ? 'odrzucone' : 'zamknięte'}.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Return Info */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 space-y-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase">Szczegóły zwrotu</h3>

            <div>
              <p className="text-xs text-gray-500">Numer zwrotu</p>
              <p className="text-white text-sm font-mono">{r.returnNumber}</p>
            </div>

            <div>
              <p className="text-xs text-gray-500">Typ</p>
              <p className="text-white text-sm">{typeLabels[r.type] || r.type}</p>
            </div>

            <div>
              <p className="text-xs text-gray-500">Status</p>
              <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium border ${statusColors[r.status]}`}>
                {statusLabels[r.status]}
              </span>
            </div>

            <div>
              <p className="text-xs text-gray-500">Utworzone</p>
              <p className="text-white text-sm">{formatDate(r.createdAt)}</p>
            </div>

            <div>
              <p className="text-xs text-gray-500">Ostatnia aktualizacja</p>
              <p className="text-white text-sm">{formatDate(r.updatedAt)}</p>
            </div>

            {r.closedAt && (
              <div>
                <p className="text-xs text-gray-500">Zamknięte</p>
                <p className="text-white text-sm">{formatDate(r.closedAt)}</p>
              </div>
            )}

            {r.adminNotes && (
              <div>
                <p className="text-xs text-gray-500">Notatki admina</p>
                <p className="text-gray-300 text-sm">{r.adminNotes}</p>
              </div>
            )}

            {r.rejectionReason && (
              <div>
                <p className="text-xs text-gray-500">Powód odrzucenia</p>
                <p className="text-red-400 text-sm">{r.rejectionReason}</p>
              </div>
            )}

            <div>
              <p className="text-xs text-gray-500">Ticket ID</p>
              <Link href={`/messages/${r.ticket.id}`} className="text-orange-400 text-sm hover:text-orange-300">
                {r.ticket.ticketNumber}
              </Link>
            </div>
          </div>

          {/* Customer Info */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 space-y-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase flex items-center gap-2">
              <User className="w-4 h-4" /> Klient
            </h3>
            <p className="text-white font-medium">{customerName}</p>
            {r.ticket.user && (
              <>
                <p className="text-gray-400 text-sm">{r.ticket.user.email}</p>
                <Link href={`/users/${r.ticket.user.id}`}
                  className="text-orange-400 text-sm hover:text-orange-300 inline-block">
                  Zobacz profil →
                </Link>
              </>
            )}
            {!r.ticket.user && r.ticket.guestEmail && (
              <p className="text-gray-400 text-sm">{r.ticket.guestEmail}</p>
            )}
            {r.ticket.guestPhone && (
              <p className="text-gray-400 text-sm">{r.ticket.guestPhone}</p>
            )}
          </div>

          {/* Order Info */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 space-y-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase flex items-center gap-2">
              <Package className="w-4 h-4" /> Zamówienie
            </h3>
            <Link href={`/orders/${r.order.id}`}
              className="text-orange-400 font-medium hover:text-orange-300 inline-block">
              {r.order.orderNumber}
            </Link>
            <div>
              <p className="text-xs text-gray-500">Wartość zamówienia</p>
              <p className="text-white text-sm">{Number(r.order.total).toFixed(2)} zł</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Data zamówienia</p>
              <p className="text-white text-sm">{formatDate(r.order.createdAt)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
