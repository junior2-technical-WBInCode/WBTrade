'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  MessageSquare, ArrowLeft, Send, Clock, CheckCircle, XCircle,
  User, ShieldCheck, AlertCircle, Package, Inbox
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

interface TicketDetail {
  id: string;
  ticketNumber: string;
  returnNumber?: string | null;
  subject: string;
  category: string;
  status: string;
  priority: string;
  lastMessageAt: string;
  createdAt: string;
  closedAt: string | null;
  closedBy: string | null;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  guestEmail?: string | null;
  guestName?: string | null;
  guestPhone?: string | null;
  order?: {
    id: string;
    orderNumber: string;
  } | null;
  messages: Message[];
}

const statusColors: Record<string, string> = {
  OPEN: 'bg-green-500/20 text-green-400 border-green-500/30',
  IN_PROGRESS: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  CLOSED: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const statusLabels: Record<string, string> = {
  OPEN: 'Otwarte',
  IN_PROGRESS: 'W trakcie',
  CLOSED: 'Zamknięte',
};

const categoryLabels: Record<string, string> = {
  ORDER: 'Zamówienie',
  DELIVERY: 'Dostawa',
  COMPLAINT: 'Reklamacja',
  RETURN: 'Zwrot',
  PAYMENT: 'Płatność',
  ACCOUNT: 'Konto',
  GENERAL: 'Ogólne',
};

const priorityLabels: Record<string, string> = {
  LOW: 'Niski',
  NORMAL: 'Normalny',
  HIGH: 'Wysoki',
};

const priorityColors: Record<string, string> = {
  LOW: 'text-gray-400',
  NORMAL: 'text-blue-400',
  HIGH: 'text-red-400',
};

export default function MessageDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ticketId = params.id as string;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef<number>(0);
  const isInitialLoadRef = useRef<boolean>(true);

  const loadTicket = useCallback(async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/admin/support/tickets/${ticketId}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTicket(data);
      } else if (response.status === 404) {
        router.push('/messages');
      }
    } catch (error) {
      console.error('Failed to load ticket:', error);
    } finally {
      setLoading(false);
    }
  }, [ticketId, router]);

  useEffect(() => {
    loadTicket();
  }, [loadTicket]);

  // ─── Auto-polling every 5s for live chat ───
  useEffect(() => {
    const interval = setInterval(() => {
      loadTicket();
    }, 5000);
    return () => clearInterval(interval);
  }, [loadTicket]);

  useEffect(() => {
    const messageCount = ticket?.messages?.length || 0;
    if (messageCount === 0) return;

    const container = messagesContainerRef.current;

    // Only scroll on first load or when new messages arrive
    if (isInitialLoadRef.current) {
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
      isInitialLoadRef.current = false;
      prevMessageCountRef.current = messageCount;
      return;
    }

    if (messageCount > prevMessageCountRef.current) {
      // New message — scroll only if user is near bottom of container
      if (container) {
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        if (distanceFromBottom < 150) {
          container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        }
      }
    }
    prevMessageCountRef.current = messageCount;
  }, [ticket?.messages]);

  const handleSendReply = async () => {
    if (!replyText.trim() || sending) return;

    try {
      setSending(true);
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/admin/support/tickets/${ticketId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ content: replyText }),
      });

      if (response.ok) {
        setReplyText('');
        await loadTicket();
      }
    } catch (error) {
      console.error('Failed to send reply:', error);
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      setStatusChanging(true);
      setShowStatusDropdown(false);
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/admin/support/tickets/${ticketId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        await loadTicket();
      }
    } catch (error) {
      console.error('Failed to change status:', error);
    } finally {
      setStatusChanging(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('pl-PL', {
      hour: '2-digit',
      minute: '2-digit',
    });
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

  if (!ticket) {
    return (
      <div className="text-center py-12">
        <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-600" />
        <p className="text-gray-400">Nie znaleziono zgłoszenia</p>
        <Link href="/messages" className="text-orange-400 hover:text-orange-300 mt-2 inline-block">
          Wróć do listy
        </Link>
      </div>
    );
  }

  // Group messages by day
  const messagesByDay: { day: string; messages: Message[] }[] = [];
  let currentDay = '';
  for (const msg of ticket.messages) {
    const day = new Date(msg.createdAt).toDateString();
    if (day !== currentDay) {
      currentDay = day;
      messagesByDay.push({ day: msg.createdAt, messages: [msg] });
    } else {
      messagesByDay[messagesByDay.length - 1].messages.push(msg);
    }
  }

  const customerName = ticket.user
    ? `${ticket.user.firstName} ${ticket.user.lastName}`
    : ticket.guestEmail || 'Gość';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/messages"
          className="p-2 bg-slate-800 rounded-lg text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white">{ticket.ticketNumber}</h1>
            <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium border ${statusColors[ticket.status] || ''}`}>
              {statusLabels[ticket.status] || ticket.status}
            </span>
            {ticket.returnNumber && (
              <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold font-mono tracking-wide ${
                ticket.category === 'RETURN'
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                  : 'bg-red-500/20 text-red-400 border border-red-500/30'
              }`}>
                {ticket.returnNumber}
              </span>
            )}
          </div>
          <p className="text-gray-400 text-sm mt-1">{ticket.subject}</p>
        </div>

        {/* Status Change */}
        <div className="relative">
          <button
            onClick={() => setShowStatusDropdown(!showStatusDropdown)}
            disabled={statusChanging}
            className="px-4 py-2 bg-slate-800 rounded-lg text-gray-300 hover:text-white transition-colors disabled:opacity-50"
          >
            {statusChanging ? 'Zmienianie...' : 'Zmień status'}
          </button>
          {showStatusDropdown && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 py-1">
              {Object.entries(statusLabels).map(([status, label]) => (
                <button
                  key={status}
                  onClick={() => handleStatusChange(status)}
                  disabled={ticket.status === status}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-2 ${
                    ticket.status === status
                      ? 'text-gray-600 cursor-not-allowed'
                      : 'text-gray-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  {status === 'OPEN' && <Inbox className="w-4 h-4 text-green-400" />}
                  {status === 'IN_PROGRESS' && <Clock className="w-4 h-4 text-yellow-400" />}
                  {status === 'CLOSED' && <XCircle className="w-4 h-4 text-gray-400" />}
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Messages Thread */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            {/* Messages */}
            <div ref={messagesContainerRef} className="p-6 space-y-6 max-h-[600px] overflow-y-auto">
              {messagesByDay.map((group, gi) => (
                <div key={gi}>
                  {/* Day separator */}
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
                          <div className={`max-w-[75%] ${isAdmin ? 'order-2' : 'order-1'}`}>
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
                            <div
                              className={`rounded-xl px-4 py-3 ${
                                isAdmin
                                  ? 'bg-orange-500/20 border border-orange-500/30 text-white'
                                  : 'bg-slate-700/50 border border-slate-600/50 text-gray-200'
                              }`}
                            >
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
              <div ref={messagesEndRef} />
            </div>

            {/* Reply Input */}
            {ticket.status !== 'CLOSED' ? (
              <div className="border-t border-slate-700 p-4">
                <div className="flex gap-3">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Napisz odpowiedź..."
                    rows={3}
                    className="flex-1 px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.ctrlKey) {
                        handleSendReply();
                      }
                    }}
                  />
                  <button
                    onClick={handleSendReply}
                    disabled={!replyText.trim() || sending}
                    className="px-4 py-3 bg-orange-500 rounded-xl text-white hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 self-end"
                  >
                    <Send className="w-4 h-4" />
                    {sending ? 'Wysyłanie...' : 'Wyślij'}
                  </button>
                </div>
                <p className="text-xs text-gray-600 mt-2">Ctrl+Enter aby wysłać</p>
              </div>
            ) : (
              <div className="border-t border-slate-700 p-4 text-center">
                <p className="text-gray-500 text-sm">
                  Zgłoszenie zostało zamknięte.{' '}
                  <button
                    onClick={() => handleStatusChange('OPEN')}
                    className="text-orange-400 hover:text-orange-300"
                  >
                    Otwórz ponownie
                  </button>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-4">
          {/* Ticket Info */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 space-y-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase">Szczegóły zgłoszenia</h3>
            
            <div>
              <p className="text-xs text-gray-500">Kategoria</p>
              <p className="text-white text-sm">{categoryLabels[ticket.category] || ticket.category}</p>
            </div>
            
            <div>
              <p className="text-xs text-gray-500">Priorytet</p>
              <p className={`text-sm font-medium ${priorityColors[ticket.priority] || 'text-white'}`}>
                {priorityLabels[ticket.priority] || ticket.priority}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500">Utworzone</p>
              <p className="text-white text-sm">{formatDate(ticket.createdAt)}</p>
            </div>

            <div>
              <p className="text-xs text-gray-500">Ostatnia wiadomość</p>
              <p className="text-white text-sm">{formatDate(ticket.lastMessageAt)}</p>
            </div>

            {ticket.closedAt && (
              <div>
                <p className="text-xs text-gray-500">Zamknięte</p>
                <p className="text-white text-sm">{formatDate(ticket.closedAt)}</p>
              </div>
            )}

            <div>
              <p className="text-xs text-gray-500">Wiadomości</p>
              <p className="text-white text-sm">{ticket.messages.length}</p>
            </div>
          </div>

          {/* Customer Info */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 space-y-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase flex items-center gap-2">
              <User className="w-4 h-4" /> Klient
            </h3>
            
            <p className="text-white font-medium">{customerName}</p>
            {ticket.user && (
              <>
                <p className="text-gray-400 text-sm">{ticket.user.email}</p>
                <Link
                  href={`/users/${ticket.user.id}`}
                  className="text-orange-400 text-sm hover:text-orange-300 inline-block"
                >
                  Zobacz profil →
                </Link>
              </>
            )}
            {!ticket.user && ticket.guestEmail && (
              <p className="text-gray-400 text-sm">{ticket.guestEmail}</p>
            )}
          </div>

          {/* Order Info */}
          {ticket.order && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 space-y-4">
              <h3 className="text-sm font-semibold text-gray-400 uppercase flex items-center gap-2">
                <Package className="w-4 h-4" /> Zamówienie
              </h3>
              <Link
                href={`/orders/${ticket.order.id}`}
                className="text-orange-400 font-medium hover:text-orange-300 inline-block"
              >
                {ticket.order.orderNumber}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
