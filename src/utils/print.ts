// CafeOS Thermal Receipt Printer Utility
import { Platform } from 'react-native';
import { Order } from '@/services/api';
import { orderApi } from '@/services/orderApi';

export function formatThermalReceiptHtml(order: Order, cafeName = 'CafeOS', cafeAddress = 'Main Street, City', phone = '+977-9800000000'): string {
  const tableNum = order.table?.tableNumber || `Table ${order.tableId}`;
  const waiterName = order.waiter?.name || 'Waiter';
  const orderId = order.id;
  const items = order.items || [];
  const createdAt = order.createdAt ? new Date(order.createdAt).toLocaleString() : new Date().toLocaleString();

  const itemsHtml = items.map(item => `
    <tr>
      <td style="text-align: left; padding: 4px 0; font-size: 13px;">${item.menuItem?.name || 'Item'}</td>
      <td style="text-align: center; padding: 4px 0; font-size: 13px;">x${item.quantity}</td>
      <td style="text-align: right; padding: 4px 0; font-size: 13px;">Rs. ${(item.price * item.quantity).toLocaleString()}</td>
    </tr>
  `).join('');

  const subtotal = order.subtotal || order.totalAmount;
  const total = order.totalAmount;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Receipt #${orderId}</title>
        <style>
          @media print {
            @page { margin: 0; size: 80mm auto; }
            body { margin: 10px; }
          }
          body {
            font-family: 'Courier New', Courier, monospace;
            width: 280px;
            margin: 0 auto;
            padding: 10px;
            color: #000;
            background: #fff;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          table { width: 100%; border-collapse: collapse; }
        </style>
      </head>
      <body>
        <div class="text-center">
          <h2 style="margin: 0 0 4px 0; font-size: 18px;">${cafeName}</h2>
          <p style="margin: 0; font-size: 11px;">${cafeAddress}</p>
          <p style="margin: 2px 0; font-size: 11px;">Tel: ${phone}</p>
        </div>
        
        <div class="divider"></div>
        
        <div style="font-size: 12px; line-height: 1.4;">
          <div><strong>Order #:</strong> ${orderId}</div>
          <div><strong>Table:</strong> ${tableNum}</div>
          <div><strong>Date:</strong> ${createdAt}</div>
          <div><strong>Served By:</strong> ${waiterName}</div>
        </div>
        
        <div class="divider"></div>
        
        <table>
          <thead>
            <tr style="border-bottom: 1px solid #000;">
              <th style="text-align: left; font-size: 12px;">ITEM</th>
              <th style="text-align: center; font-size: 12px;">QTY</th>
              <th style="text-align: right; font-size: 12px;">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        
        <div class="divider"></div>
        
        <div style="font-size: 13px; line-height: 1.5;">
          <div style="display: flex; justify-content: space-between;">
            <span>Subtotal:</span>
            <span>Rs. ${Number(subtotal).toLocaleString()}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 15px; margin-top: 4px;">
            <span>TOTAL:</span>
            <span>Rs. ${Number(total).toLocaleString()}</span>
          </div>
        </div>
        
        <div class="divider"></div>
        
        <div class="text-center" style="font-size: 11px; margin-top: 12px;">
          <p style="margin: 0;">Thank you for dining with us!</p>
          <p style="margin: 4px 0; font-size: 10px; color: #555;">Powered by Leading Edge Software</p>
        </div>
        
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
    </html>
  `;
}

export async function executeOrderPrint(orderId: number, orderData?: Order): Promise<boolean> {
  try {
    // 1. Call API print bill endpoint
    const apiRes = await orderApi.printBill(orderId);

    // 2. If running in a web browser, trigger web printing pop-up window
    if (Platform.OS === 'web') {
      let fullOrder = orderData;
      if (!fullOrder || !fullOrder.items || fullOrder.items.length === 0) {
        const orderRes = await orderApi.getOrder(orderId);
        if (orderRes.success && orderRes.data) {
          fullOrder = orderRes.data;
        }
      }

      if (fullOrder) {
        const printHtml = formatThermalReceiptHtml(fullOrder);
        const printWindow = window.open('', '_blank', 'width=400,height=600');
        if (printWindow) {
          printWindow.document.write(printHtml);
          printWindow.document.close();
        }
      }
    }

    return apiRes.success;
  } catch (err) {
    console.error('Print execution error:', err);
    return false;
  }
}
