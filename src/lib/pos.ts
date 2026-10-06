import { supabase } from './supabase';

export type OrderStatus = 'pending' | 'preparing' | 'completed' | 'cancelled';

export type MenuItem = {
  id: string;
  name: string;
  price: number;
  category: string;
  is_available: boolean;
  created_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  item_name: string;
  quantity: number;
  item_price: number;
};

export type Order = {
  id: string;
  table_number: string | null;
  status: OrderStatus;
  total_amount: number;
  notes: string | null;
  created_at: string;
  order_items: OrderItem[];
};

export const CATEGORIES = [
  'Tea',
  'Coffee',
  'Hot Beverages',
  'Soft Drinks',
  'Milkshakes',
  'Freshers',
  'Sandwich',
  'Crunches',
  'Chats',
  'Country Chats',
  'Egg Items',
  'Home Dosa',
] as const;

export const STATUS_FLOW: Record<OrderStatus, { next: OrderStatus | null; label: string }> = {
  pending: { next: 'preparing', label: 'Accept' },
  preparing: { next: 'completed', label: 'Mark Ready' },
  completed: { next: null, label: 'Done' },
  cancelled: { next: null, label: 'Cancelled' },
};

export function formatMoney(value: number): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

export function timeAgo(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

export async function fetchMenuItems(): Promise<MenuItem[]> {
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .order('category')
    .order('name');

  if (error) throw error;

  return (data ?? []).map((item) => ({
    ...item,
    price: Number(item.price),
    is_available: Boolean(item.is_available),
  })) as MenuItem[];
}

export async function fetchOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw error;
  return (data ?? []) as unknown as Order[];
}

// Create fresh order with live availability guard
// Create fresh order with live availability guard
export async function createOrder(input: {
  tableNumber: string;
  notes: string;
  lines: { item: MenuItem; quantity: number }[];
}) {
  // 1. Live server-side check: make sure none of the ordered items are turned OFF
  const itemIds = input.lines.map((l) => l.item.id);
  const { data: dbItems, error: checkError } = await supabase
    .from('menu_items')
    .select('id, name, is_available')
    .in('id', itemIds);

  if (checkError) throw checkError;

  const unavailable = (dbItems ?? []).filter((i) => !i.is_available);
  if (unavailable.length > 0) {
    const names = unavailable.map((i) => `"${i.name}"`).join(', ');
    throw new Error(`Cannot place order: ${names} is currently turned OFF / Sold out.`);
  }

  // 2. Compute total
  const total = input.lines.reduce((sum, l) => sum + Number(l.item.price) * l.quantity, 0);

  // 3. Insert order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      table_number: input.tableNumber.trim() || null,
      notes: input.notes.trim() || null,
      status: 'pending',
      total_amount: total,
    })
    .select()
    .single();

  if (orderError) throw orderError;

  // 4. Insert lines
  const { error: itemsError } = await supabase.from('order_items').insert(
    input.lines.map((l) => ({
      order_id: order.id,
      menu_item_id: l.item.id,
      item_name: l.item.name,
      quantity: l.quantity,
      item_price: Number(l.item.price),
    }))
  );

  if (itemsError) throw itemsError;
  return order;
}

// Update existing order with live availability guard
export async function updateOrder(
  orderId: string,
  input: {
    tableNumber: string;
    notes: string;
    lines: { item: MenuItem; quantity: number }[];
  }
) {
  // Live server-side check
  const itemIds = input.lines.map((l) => l.item.id);
  const { data: dbItems, error: checkError } = await supabase
    .from('menu_items')
    .select('id, name, is_available')
    .in('id', itemIds);

  if (checkError) throw checkError;

  const unavailable = (dbItems ?? []).filter((i) => !i.is_available);
  if (unavailable.length > 0) {
    const names = unavailable.map((i) => `"${i.name}"`).join(', ');
    throw new Error(`Cannot update: ${names} is currently turned OFF.`);
  }

  const total = input.lines.reduce((sum, l) => sum + Number(l.item.price) * l.quantity, 0);

  const { error: orderError } = await supabase
    .from('orders')
    .update({
      table_number: input.tableNumber.trim() || null,
      notes: input.notes.trim() || null,
      total_amount: total,
    })
    .eq('id', orderId);

  if (orderError) throw orderError;

  const { error: deleteError } = await supabase
    .from('order_items')
    .delete()
    .eq('order_id', orderId);

  if (deleteError) throw deleteError;

  const { error: insertError } = await supabase.from('order_items').insert(
    input.lines.map((l) => ({
      order_id: orderId,
      menu_item_id: l.item.id,
      item_name: l.item.name,
      quantity: l.quantity,
      item_price: Number(l.item.price),
    }))
  );

  if (insertError) throw insertError;
}

export async function updateOrderStatus(id: string, status: OrderStatus) {
  const { error } = await supabase.from('orders').update({ status }).eq('id', id);
  if (error) throw error;
}

// Reject entire ticket without touching menu_items table
export async function rejectOrder(id: string, reason: string) {
  const { error } = await supabase
    .from('orders')
    .update({
      status: 'cancelled',
      notes: reason,
    })
    .eq('id', id);

  if (error) throw error;
}

// Reject a single item from an active order without touching menu_items table
export async function rejectOrderItem(
  orderId: string,
  itemId: string,
  itemPrice: number,
  qty: number,
  reason: string
) {
  const { error: deleteErr } = await supabase
    .from('order_items')
    .delete()
    .eq('id', itemId);

  if (deleteErr) throw deleteErr;

  const { data: order } = await supabase
    .from('orders')
    .select('total_amount, notes')
    .eq('id', orderId)
    .single();

  if (order) {
    const newTotal = Math.max(0, Number(order.total_amount) - Number(itemPrice) * qty);
    const appendNote = order.notes
      ? `${order.notes} | Rejected: ${reason}`
      : `Rejected: ${reason}`;

    await supabase
      .from('orders')
      .update({
        total_amount: newTotal,
        notes: appendNote,
      })
      .eq('id', orderId);
  }
}