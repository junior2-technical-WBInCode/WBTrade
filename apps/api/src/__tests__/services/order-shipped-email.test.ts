import { EMAIL_TEMPLATES } from '../../workers/email.worker';

// The shipped email is sent from ordersService.updateStatus for every path
// (admin, Baselinker sync, courier sync) - tracking data may be missing.
describe('order-shipped email template', () => {
  const tpl = EMAIL_TEMPLATES['order-shipped'];

  it('renders full tracking info when provided', () => {
    const { subject, html, text } = tpl({
      orderId: 'WB-123',
      trackingNumber: 'PX12345',
      carrier: 'inpost',
      trackingUrl: 'https://inpost.pl/sledzenie-przesylek?number=PX12345',
    });
    expect(subject).toContain('WB-123');
    expect(html).toContain('PX12345');
    expect(html).toContain('inpost');
    expect(html).toContain('Śledź przesyłkę');
    expect(text).toContain('PX12345');
  });

  it('omits tracking lines instead of printing "undefined" when data is missing', () => {
    const { html, text } = tpl({ orderId: 'WB-124' });
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('Numer przesyłki');
    expect(html).not.toContain('Śledź przesyłkę');
    expect(text).not.toContain('undefined');
  });
});
