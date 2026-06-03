import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Linking,
} from 'react-native';
import { customAlert } from '../../../components/ui/CustomAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'expo-image';
import { useThemeColors } from '../../../hooks/useThemeColors';
import type { ThemeColors } from '../../../constants/Colors';
import { ordersApi } from '../../../services/orders';
import { checkoutApi } from '../../../services/orders';
import type { Order, OrderItem } from '../../../services/types';

// ─── Status config ───

type StatusKey = Order['status'];

interface StatusConfig {
  label: string;
  bg: string;
  text: string;
  icon: string;
}

const getStatusMap = (colors: ThemeColors): Record<StatusKey, StatusConfig> => ({
  OPEN:       { label: 'Otwarte',       bg: colors.warningBg,          text: colors.warningText,      icon: 'hourglass-start' },
  PENDING:    { label: 'Nowe',          bg: colors.warningBg,          text: colors.warningText,      icon: 'clock-o' },
  CONFIRMED:  { label: 'Potwierdzone',  bg: colors.tintLight,          text: colors.tint,             icon: 'check' },
  PROCESSING: { label: 'W realizacji',  bg: colors.tintLight,          text: colors.tint,             icon: 'cog' },
  SHIPPED:    { label: 'Wysłane',       bg: colors.tintMuted,          text: colors.tint,             icon: 'truck' },
  DELIVERED:  { label: 'Dostarczone',   bg: colors.successBg,          text: colors.successText,      icon: 'check-circle' },
  CANCELLED:  { label: 'Anulowane',     bg: colors.destructiveBg,      text: colors.destructiveText,  icon: 'times-circle' },
  REFUNDED:   { label: 'Zwrócone',      bg: colors.backgroundTertiary, text: colors.textSecondary,    icon: 'undo' },
});

// Ordered progression for timeline
const STATUS_TIMELINE: StatusKey[] = [
  'OPEN',
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
];

function getStatusConfig(status: string, colors: ThemeColors): StatusConfig {
  const statusMap = getStatusMap(colors);
  return statusMap[status as StatusKey] ?? { label: status, bg: colors.backgroundTertiary, text: colors.textSecondary, icon: 'question' };
}

// ─── Helpers ───

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPrice(value: number): string {
  const num = Number(value) || 0;
  return `${num.toFixed(2).replace('.', ',')} zł`;
}

function getPaymentStatusLabel(status: string | undefined, colors: ReturnType<typeof useThemeColors>): { label: string; color: string } {
  switch (status) {
    case 'PAID': return { label: 'Opłacone', color: colors.success };
    case 'PENDING': return { label: 'Oczekuje na płatność', color: colors.warning };
    case 'FAILED': return { label: 'Płatność nieudana', color: colors.destructive };
    case 'REFUNDED': return { label: 'Zwrócone', color: colors.destructive };
    case 'PARTIALLY_REFUNDED': return { label: 'Częściowo zwrócone', color: colors.destructive };
    case 'CANCELLED': return { label: 'Anulowana', color: colors.textMuted };
    default: return { label: status ?? '—', color: colors.textMuted };
  }
}

function getPaymentMethodLabel(method: string): string {
  const map: Record<string, string> = {
    przelewy24: 'Przelewy24',
    blik: 'BLIK',
    card: 'Karta płatnicza',
    transfer: 'Przelew bankowy',
    cod: 'Pobranie',
  };
  return map[method?.toLowerCase()] ?? method ?? '—';
}

// ─── Status Timeline ───

function StatusTimeline({ currentStatus }: { currentStatus: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isCancelled = currentStatus === 'CANCELLED' || currentStatus === 'REFUNDED';
  const currentIndex = STATUS_TIMELINE.indexOf(currentStatus as StatusKey);

  const steps = isCancelled
    ? [...STATUS_TIMELINE.slice(0, Math.max(currentIndex, 1)), currentStatus as StatusKey]
    : STATUS_TIMELINE;

  return (
    <View style={styles.timeline}>
      {steps.map((status, i) => {
        const cfg = getStatusConfig(status, colors);
        const isActive = isCancelled
          ? i <= steps.length - 1
          : currentIndex >= i;
        const isLast = i === steps.length - 1;

        return (
          <View key={status} style={styles.timelineStep}>
            {/* Line above */}
            {i > 0 && (
              <View
                style={[
                  styles.timelineLine,
                  { backgroundColor: isActive ? cfg.text : colors.border },
                ]}
              />
            )}
            {/* Dot */}
            <View
              style={[
                styles.timelineDot,
                {
                  backgroundColor: isActive ? cfg.text : colors.card,
                  borderColor: isActive ? cfg.text : colors.inputBorder,
                },
              ]}
            >
              {isActive && (
                <FontAwesome name={cfg.icon as any} size={10} color={colors.textInverse} />
              )}
            </View>
            {/* Label */}
            <Text
              style={[
                styles.timelineLabel,
                {
                  color: isActive ? cfg.text : colors.textMuted,
                  fontWeight: isActive ? '600' : '400',
                },
              ]}
            >
              {cfg.label}
            </Text>
            {/* Line below */}
            {!isLast && (
              <View
                style={[
                  styles.timelineLineBelow,
                  {
                    backgroundColor:
                      (isCancelled ? i < steps.length - 1 : currentIndex > i)
                        ? getStatusConfig(steps[i + 1], colors).text
                        : colors.border,
                  },
                ]}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── Item Row ───

function ItemRow({ item }: { item: OrderItem }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const imageUrl = item.variant?.product?.images?.[0]?.url;

  return (
    <View style={styles.itemRow}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.itemImage} contentFit="contain" />
      ) : (
        <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
          <FontAwesome name="image" size={20} color={colors.inputBorder} />
        </View>
      )}
      <View style={styles.itemInfo}>
        <Text style={styles.itemName} numberOfLines={2}>
          {item.productName}
        </Text>
        {item.variantName ? (
          <Text style={styles.itemVariant}>{item.variantName}</Text>
        ) : null}
        <View style={styles.itemBottom}>
          <Text style={styles.itemQty}>
            {item.quantity} szt. × {formatPrice(item.unitPrice)}
          </Text>
          <Text style={styles.itemPrice}>{formatPrice(item.total)}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Main Screen ───

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tracking
  const [trackingPackages, setTrackingPackages] = useState<
    Array<{ courierName: string; trackingNumber: string | null; trackingLink?: string; isSent: boolean }>
  >([]);

  // Refund eligibility
  const [refundEligible, setRefundEligible] = useState(false);
  const [refundDaysLeft, setRefundDaysLeft] = useState(0);
  const [refundLoading, setRefundLoading] = useState(false);

  // Pay / Cancel actions
  const [payLoading, setPayLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  // ── Fetch order + extras ──

  const fetchOrder = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const res = await ordersApi.getById(id);
      const ord: Order = (res as any).order ?? res;
      setOrder(ord);

      // Fetch tracking in parallel (best-effort)
      try {
        const trackRes = await ordersApi.getTracking(id);
        setTrackingPackages((trackRes as any).packages ?? []);
      } catch {
        // No tracking available — that's fine
      }

      // Fetch refund eligibility (best-effort)
      if (ord.status === 'DELIVERED' || ord.status === 'SHIPPED') {
        try {
          const refundRes = await ordersApi.getRefundEligibility(id);
          const data = refundRes as any;
          setRefundEligible(!!data.eligible);
          setRefundDaysLeft(data.daysRemaining ?? 0);
        } catch {
          // ignore
        }
      }
    } catch {
      setError('Nie udało się pobrać szczegółów zamówienia');
    }
  }, [id]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchOrder();
      setLoading(false);
    })();
  }, [fetchOrder]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOrder();
    setRefreshing(false);
  }, [fetchOrder]);

  // ── Tracking link ──

  const openTracking = useCallback((link: string) => {
    Linking.openURL(link).catch(() => {
      customAlert('Błąd', 'Nie udało się otworzyć linku śledzenia.');
    });
  }, []);

  // ── Request refund ──

  const handleRefund = useCallback(() => {
    customAlert(
      'Złóż wniosek o zwrot',
      'Czy na pewno chcesz złożyć wniosek o zwrot tego zamówienia?',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Złóż wniosek',
          style: 'destructive',
          onPress: async () => {
            if (!id) return;
            setRefundLoading(true);
            try {
              const res = await ordersApi.requestRefund(id);
              const data = res as any;
              if (data.success) {
                customAlert(
                  'Wniosek złożony',
                  `Numer zwrotu: ${data.refundNumber ?? '—'}\n\nAdres do odesłania:\n${
                    data.returnAddress
                      ? `${data.returnAddress.name}\n${data.returnAddress.street}\n${data.returnAddress.postalCode} ${data.returnAddress.city}`
                      : 'Sprawdź email'
                  }`,
                );
                setRefundEligible(false);
                await fetchOrder();
              } else {
                customAlert('Błąd', data.message ?? 'Nie udało się złożyć wniosku.');
              }
            } catch {
              customAlert('Błąd', 'Nie udało się złożyć wniosku o zwrot.');
            } finally {
              setRefundLoading(false);
            }
          },
        },
      ],
    );
  }, [id, fetchOrder]);

  // ── Retry payment ──

  const handleRetryPayment = useCallback(async () => {
    if (!id) return;
    setPayLoading(true);
    try {
      const res = await checkoutApi.retryPayment(id);
      const data = res as any;
      if (data.paymentUrl) {
        router.push(`/order/${id}/payment?url=${encodeURIComponent(data.paymentUrl)}` as any);
      } else {
        customAlert('Błąd', 'Nie udało się utworzyć sesji płatności.');
      }
    } catch {
      customAlert('Błąd', 'Nie udało się ponowić płatności. Spróbuj ponownie.');
    } finally {
      setPayLoading(false);
    }
  }, [id, router]);

  // ── Cancel order ──

  const handleCancelOrder = useCallback(() => {
    customAlert(
      'Anuluj zamówienie',
      'Czy na pewno chcesz anulować to zamówienie? Tej operacji nie można cofnąć.',
      [
        { text: 'Nie', style: 'cancel' },
        {
          text: 'Anuluj zamówienie',
          style: 'destructive',
          onPress: async () => {
            if (!id) return;
            setCancelLoading(true);
            try {
              await ordersApi.cancel(id);
              customAlert('Zamówienie anulowane', 'Twoje zamówienie zostało anulowane.');
              await fetchOrder();
            } catch {
              customAlert('Błąd', 'Nie udało się anulować zamówienia.');
            } finally {
              setCancelLoading(false);
            }
          },
        },
      ],
    );
  }, [id, fetchOrder]);

  // ─── Render states ───

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen options={{ title: 'Zamówienie' }} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={styles.loadingText}>Ładowanie zamówienia…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !order) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen options={{ title: 'Zamówienie' }} />
        <View style={styles.center}>
          <FontAwesome name="exclamation-circle" size={48} color={colors.destructive} />
          <Text style={styles.errorText}>{error ?? 'Nie znaleziono zamówienia'}</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
            <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.tint }]} onPress={() => fetchOrder()}>
              <Text style={[styles.retryBtnText, { color: '#fff' }]}>Spróbuj ponownie</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.retryBtn} onPress={() => router.back()}>
              <Text style={styles.retryBtnText}>Wróć</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const statusCfg = getStatusConfig(order.status, colors);
  const addr = order.shippingAddress;
  const paymentInfo = getPaymentStatusLabel(order.paymentStatus, colors);
  const sentPackages = trackingPackages.filter((p) => p.trackingNumber);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: `#${order.orderNumber}` }} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.tint]}
            tintColor={colors.tint}
          />
        }
      >
        {/* ── Header ── */}
        <View style={styles.section}>
          <View style={styles.headerRow}>
            <Text style={styles.sectionTitle}>Zamówienie #{order.orderNumber}</Text>
            <View style={[styles.chip, { backgroundColor: statusCfg.bg }]}>
              <Text style={[styles.chipText, { color: statusCfg.text }]}>{statusCfg.label}</Text>
            </View>
          </View>
          <Text style={styles.dateText}>Złożono: {formatDate(order.createdAt)}</Text>
        </View>

        {/* ── Status Timeline ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Status zamówienia</Text>
          <StatusTimeline currentStatus={order.status} />
        </View>

        {/* ── Tracking ── */}
        {sentPackages.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Śledzenie przesyłki</Text>
            {sentPackages.map((pkg, i) => (
              <TouchableOpacity
                key={i}
                style={styles.trackingCard}
                onPress={() => pkg.trackingLink && openTracking(pkg.trackingLink)}
                disabled={!pkg.trackingLink}
                activeOpacity={0.7}
              >
                <View style={styles.trackingLeft}>
                  <FontAwesome name="truck" size={16} color={colors.tint} />
                  <View style={{ marginLeft: 10 }}>
                    <Text style={styles.trackingCourier}>{pkg.courierName}</Text>
                    <Text style={styles.trackingNum}>{pkg.trackingNumber}</Text>
                  </View>
                </View>
                {pkg.trackingLink && (
                  <FontAwesome name="external-link" size={14} color={colors.tint} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Products ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Produkty ({order.items.length})
          </Text>
          {order.items.map((item) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </View>

        {/* ── Summary ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Podsumowanie</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Produkty</Text>
            <Text style={styles.summaryValue}>{formatPrice(order.subtotal)}</Text>
          </View>
          {order.discount > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Rabat</Text>
              <Text style={[styles.summaryValue, { color: colors.success }]}>
                -{formatPrice(order.discount)}
              </Text>
            </View>
          )}
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Dostawa</Text>
            <Text style={styles.summaryValue}>
              {order.shipping > 0 ? formatPrice(order.shipping) : 'Gratis'}
            </Text>
          </View>
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Łącznie</Text>
            <Text style={styles.totalValue}>{formatPrice(order.total)}</Text>
          </View>
        </View>

        {/* ── Payment & Shipping info ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Płatność i dostawa</Text>

          <View style={styles.infoRow}>
            <FontAwesome name="credit-card" size={14} color={colors.textMuted} />
            <Text style={styles.infoLabel}>Metoda płatności</Text>
            <Text style={styles.infoValue}>{getPaymentMethodLabel(order.paymentMethod)}</Text>
          </View>

          <View style={styles.infoRow}>
            <FontAwesome name="money" size={14} color={colors.textMuted} />
            <Text style={styles.infoLabel}>Status płatności</Text>
            <Text style={[styles.infoValue, { color: paymentInfo.color }]}>
              {paymentInfo.label}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <FontAwesome name="truck" size={14} color={colors.textMuted} />
            <Text style={styles.infoLabel}>Metoda wysyłki</Text>
            <Text style={styles.infoValue}>{order.shippingMethod}</Text>
          </View>

          {order.paczkomatCode && (
            <View style={styles.infoRow}>
              <FontAwesome name="map-pin" size={14} color={colors.textMuted} />
              <Text style={styles.infoLabel}>Paczkomat</Text>
              <Text style={styles.infoValue}>{order.paczkomatCode}</Text>
            </View>
          )}
        </View>

        {/* ── Pay / Cancel actions ── */}
        {order.status !== 'CANCELLED' && order.status !== 'REFUNDED' && order.status !== 'DELIVERED' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Akcje</Text>
            {(order.paymentStatus === 'PENDING' || order.paymentStatus === 'FAILED') && !['cod', 'b2b_transfer', 'b2b_przelew', 'bank_transfer', 'transfer'].includes(order.paymentMethod) && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.tint }]}
                onPress={handleRetryPayment}
                disabled={payLoading}
                activeOpacity={0.7}
              >
                {payLoading ? (
                  <ActivityIndicator size="small" color={colors.textInverse} />
                ) : (
                  <>
                    <FontAwesome name="credit-card" size={16} color={colors.textInverse} />
                    <Text style={styles.actionBtnText}>Opłać zamówienie</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            {(order.status === 'OPEN' || order.status === 'PENDING' || order.status === 'CONFIRMED') && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.cancelBtn, { borderColor: colors.destructive }]}
                onPress={handleCancelOrder}
                disabled={cancelLoading}
                activeOpacity={0.7}
              >
                {cancelLoading ? (
                  <ActivityIndicator size="small" color={colors.destructive} />
                ) : (
                  <>
                    <FontAwesome name="times" size={16} color={colors.destructive} />
                    <Text style={[styles.actionBtnText, { color: colors.destructive }]}>Anuluj zamówienie</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Shipping address ── */}
        {addr && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Adres dostawy</Text>
            <Text style={styles.addrText}>
              {addr.firstName} {addr.lastName}
            </Text>
            <Text style={styles.addrText}>{addr.street}</Text>
            <Text style={styles.addrText}>
              {addr.postalCode} {addr.city}
            </Text>
            {addr.phone ? (
              <Text style={styles.addrText}>Tel: {addr.phone}</Text>
            ) : null}
            {addr.email ? (
              <Text style={styles.addrText}>Email: {addr.email}</Text>
            ) : null}
          </View>
        )}

        {/* ── Actions ── */}
        {refundEligible && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Zwrot</Text>
            <Text style={styles.refundHint}>
              Masz jeszcze {refundDaysLeft} {refundDaysLeft === 1 ? 'dzień' : 'dni'} na złożenie wniosku o zwrot.
            </Text>
            <TouchableOpacity
              style={styles.refundBtn}
              onPress={handleRefund}
              disabled={refundLoading}
              activeOpacity={0.7}
            >
              {refundLoading ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <>
                  <FontAwesome name="undo" size={14} color={colors.textInverse} />
                  <Text style={styles.refundBtnText}>Złóż wniosek o zwrot</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Bottom padding */}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  dateText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Timeline
  timeline: {
    paddingLeft: 4,
  },
  timelineStep: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    marginBottom: 0,
    minHeight: 40,
  },
  timelineLine: {
    position: 'absolute',
    left: 10,
    top: -20,
    width: 2,
    height: 20,
  },
  timelineLineBelow: {
    position: 'absolute',
    left: 10,
    bottom: -20,
    width: 2,
    height: 20,
  },
  timelineDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  timelineLabel: {
    marginLeft: 12,
    fontSize: 14,
  },

  // Tracking
  trackingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  trackingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackingCourier: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  trackingNum: {
    fontSize: 12,
    color: colors.tint,
    marginTop: 2,
  },

  // Items
  itemRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  itemImage: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: colors.backgroundTertiary,
  },
  itemImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  itemVariant: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  itemBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  itemQty: {
    fontSize: 13,
    color: colors.textMuted,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },

  // Summary
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  summaryLabel: {
    fontSize: 14,
    color: colors.textMuted,
  },
  summaryValue: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  totalRow: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginBottom: 0,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.tint,
  },

  // Payment & shipping info
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 13,
    color: colors.textMuted,
    flex: 1,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },

  // Address
  addrText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },

  // Refund
  refundHint: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 12,
  },
  refundBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.destructive,
    paddingVertical: 12,
    borderRadius: 8,
  },
  refundBtnText: {
    color: colors.textInverse,
    fontWeight: '600',
    fontSize: 14,
  },

  // Action buttons (Pay / Cancel)
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 10,
  },
  cancelBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
  actionBtnText: {
    color: colors.textInverse,
    fontWeight: '700',
    fontSize: 15,
  },

  // Loading / error
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textMuted,
  },
  errorText: {
    marginTop: 12,
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: colors.tint,
    borderRadius: 8,
  },
  retryBtnText: {
    color: colors.textInverse,
    fontWeight: '600',
    fontSize: 14,
  },
});
