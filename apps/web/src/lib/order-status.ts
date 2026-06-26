/**
 * Shared order status utilities
 * Single source of truth for order status labels, colors, and icons
 */

export type OrderStatus = 'OPEN' | 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';
export type PaymentStatus = 'PENDING' | 'AWAITING_CONFIRMATION' | 'PAID' | 'FAILED' | 'REFUNDED' | 'CANCELLED';

/**
 * Get human-readable status label.
 * Takes into account both order status and payment status for correct display.
 */
export function getStatusLabel(status: string, paymentStatus?: string): string {
  // If order is cancelled/refunded, always show that regardless of payment status
  if (status === 'CANCELLED') return 'Anulowano';
  if (status === 'REFUNDED') return 'Zwrócono';

  // If order is in OPEN or PENDING status, it is awaiting payment
  if (status === 'OPEN' || status === 'PENDING') {
    return 'Oczekuje na płatność';
  }

  switch (status) {
    case 'PENDING':
      return 'Oczekuje na płatność';
    case 'CONFIRMED':
      return 'Opłacone';
    case 'PROCESSING':
      return 'W realizacji';
    case 'SHIPPED':
      return 'W drodze';
    case 'DELIVERED':
      return 'Dostarczono';
    default:
      return status;
  }
}

/**
 * Get CSS classes for status badge coloring.
 * Takes into account payment status for correct coloring of unpaid orders.
 */
export function getStatusColor(status: string, paymentStatus?: string): string {
  // Cancelled/refunded always get their own colors
  if (status === 'CANCELLED') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
  if (status === 'REFUNDED') return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300';

  // Unpaid orders get orange
  if (status === 'OPEN' || status === 'PENDING') {
    return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
  }

  switch (status) {
    case 'CONFIRMED':
    case 'PROCESSING':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    case 'SHIPPED':
      return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300';
    case 'DELIVERED':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300';
  }
}

/**
 * Check if an order is considered "unpaid" for filtering purposes.
 * OPEN and PENDING statuses.
 */
export function isUnpaidOrder(status: string, paymentStatus?: string): boolean {
  if (status === 'CANCELLED' || status === 'REFUNDED') return false;
  return status === 'OPEN' || status === 'PENDING';
}

/**
 * Filter tabs for orders page
 */
export const ORDER_FILTER_TABS = [
  { id: 'all', label: 'Wszystkie' },
  { id: 'UNPAID', label: 'Oczekujące' },
  { id: 'SHIPPED', label: 'W drodze' },
  { id: 'DELIVERED', label: 'Dostarczone' },
  { id: 'CANCELLED', label: 'Anulowane' },
  { id: 'REFUNDED', label: 'Zwroty' },
] as const;

/**
 * Match an order against a filter tab ID.
 * Groups OPEN + PENDING + paymentStatus PENDING into "UNPAID".
 */
export function matchesFilter(order: { status: string; paymentStatus?: string }, filterId: string): boolean {
  if (filterId === 'all') return true;
  if (filterId === 'UNPAID') return isUnpaidOrder(order.status, order.paymentStatus);
  return order.status === filterId;
}
