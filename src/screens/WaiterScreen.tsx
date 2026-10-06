import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import {
  fetchMenuItems,
  fetchOrders,
  createOrder,
  updateOrder,
  formatMoney,
  type MenuItem,
  type Order,
} from '../lib/pos';

export default function WaiterScreen() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cart & Ordering State
  const [cart, setCart] = useState<Record<string, number>>({});
  const [tableNumber, setTableNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [trayOpen, setTrayOpen] = useState(false);
  const [trayHeight, setTrayHeight] = useState(80);

  // Edit Existing Order State
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [recentOrdersModalOpen, setRecentOrdersModalOpen] = useState(false);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [isLoadingActive, setIsLoadingActive] = useState(false);

  const loadMenu = async () => {
    try {
      setIsLoading(true);
      const data = await fetchMenuItems();
      setItems(data);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load menu items');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
  loadMenu();

  // Unified Realtime Channel
  const channel = supabase
    .channel('waiter-screen-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'menu_items' },
      (payload) => {
        if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
          const updatedItem: MenuItem = {
            ...(payload.new as MenuItem),
            price: Number((payload.new as any).price),
            is_available: Boolean((payload.new as any).is_available),
          };

          // Instant local state update
          setItems((prevItems) => {
            const exists = prevItems.some((i) => i.id === updatedItem.id);
            if (!exists) return [...prevItems, updatedItem];
            return prevItems.map((i) => (i.id === updatedItem.id ? updatedItem : i));
          });

          // If turned OFF, instantly purge from the cart
          if (!updatedItem.is_available) {
            setCart((currentCart) => {
              if (currentCart[updatedItem.id]) {
                const updated = { ...currentCart };
                delete updated[updatedItem.id];
                return updated;
              }
              return currentCart;
            });

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          }
        } else if (payload.eventType === 'DELETE') {
          const deletedId = (payload.old as { id: string }).id;
          setItems((prev) => prev.filter((i) => i.id !== deletedId));
          setCart((currentCart) => {
            const updated = { ...currentCart };
            delete updated[deletedId];
            return updated;
          });
        }
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders' },
      (payload) => {
        const updated = payload.new as Order;
        if (updated.status === 'cancelled') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert(
            'Order Rejected by Chef',
            `${updated.table_number ? `Table ${updated.table_number}` : 'Counter Order'} was cancelled.\nReason: ${updated.notes || 'No reason specified'}`
          );
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // Silent background sync once channel connects
        loadMenu();
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}, []);

  const loadActiveOrders = async () => {
    try {
      setIsLoadingActive(true);
      const orders = await fetchOrders();
      setActiveOrders(orders.filter((o) => o.status !== 'completed' && o.status !== 'cancelled'));
      setRecentOrdersModalOpen(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to fetch active orders');
    } finally {
      setIsLoadingActive(false);
    }
  };

  const handleEditOrder = (order: Order) => {
    const newCart: Record<string, number> = {};
    order.order_items.forEach((line) => {
      if (line.menu_item_id) {
        newCart[line.menu_item_id] = line.quantity;
      }
    });

    setCart(newCart);
    setTableNumber(order.table_number || '');
    setNotes(order.notes || '');
    setEditingOrderId(order.id);
    setRecentOrdersModalOpen(false);
    setTrayOpen(true);
  };

  const handleCancelEdit = () => {
    setEditingOrderId(null);
    setCart({});
    setTableNumber('');
    setNotes('');
    setTrayOpen(false);
  };

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(items.map((i) => i.category)))],
    [items]
  );

  const visible = useMemo(() => {
    let list = category === 'All' ? items : items.filter((i) => i.category === category);

    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (i) => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q)
      );
    }

    return list;
  }, [items, category, searchQuery]);

  const lines = useMemo(
  () =>
    Object.entries(cart)
      .map(([id, quantity]) => ({ item: items.find((i) => i.id === id), quantity }))
      .filter(
        (l): l is { item: MenuItem; quantity: number } =>
          Boolean(l.item) && l.item.is_available === true && l.quantity > 0
      ),
  [cart, items]
);

  const total = lines.reduce((s, l) => s + l.item.price * l.quantity, 0);
  const count = lines.reduce((s, l) => s + l.quantity, 0);

 const bump = (item: MenuItem, delta: number) => {
  // Check latest item state
  const latestItem = items.find((i) => i.id === item.id) ?? item;
  
  if (!latestItem.is_available) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      '⛔ Item Blocked',
      `"${latestItem.name}" is currently turned OFF. It cannot be added to an order.`
    );
    // Force purge from cart if it lingered
    setCart((prev) => {
      const copy = { ...prev };
      delete copy[latestItem.id];
      return copy;
    });
    return;
  }

  setCart((prev) => {
    const next = Math.max(0, (prev[item.id] ?? 0) + delta);
    const copy = { ...prev };
    if (next === 0) delete copy[item.id];
    else copy[item.id] = next;
    return copy;
  });
};

  const handleSendOrder = async () => {
  if (lines.length === 0) {
    Alert.alert('Empty Order', 'Please select at least one available item.');
    return;
  }

  // Pre-flight check against local item list
  const invalidItems = lines.filter((l) => !l.item.is_available);
  if (invalidItems.length > 0) {
    const names = invalidItems.map((l) => `"${l.item.name}"`).join(', ');
    Alert.alert(
      'Cannot Send Order',
      `The following items were turned OFF and removed: ${names}`
    );
    // Clean cart
    setCart((prev) => {
      const copy = { ...prev };
      invalidItems.forEach((l) => delete copy[l.item.id]);
      return copy;
    });
    return;
  }

  try {
    setIsSubmitting(true);
    if (editingOrderId) {
      await updateOrder(editingOrderId, { tableNumber, notes, lines });
      Alert.alert('Success', 'Order updated in the kitchen');
    } else {
      await createOrder({ tableNumber, notes, lines });
      Alert.alert('Success', `Sent to kitchen (${count} item${count === 1 ? '' : 's'})`);
    }
    setCart({});
    setNotes('');
    setTableNumber('');
    setEditingOrderId(null);
    setTrayOpen(false);
  } catch (err: any) {
    Alert.alert('Order Blocked', err.message || 'Could not process order');
    // Refresh menu items immediately so the waiter gets fresh state
    loadMenu();
  } finally {
    setIsSubmitting(false);
  }
};

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Take an Order</Text>
            <Text style={styles.headerSubtitle}>Tap items to build the ticket</Text>
          </View>
          <TouchableOpacity
            style={styles.activeOrdersButton}
            onPress={loadActiveOrders}
            activeOpacity={0.8}
          >
            <Feather name="clock" size={16} color="#E65100" />
            <Text style={styles.activeOrdersText}>Active Tickets</Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchWrapper}>
          <View style={styles.searchBar}>
            <Feather name="search" size={18} color="#8E8E93" style={styles.searchIcon} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search tea, coffee, snacks..."
              placeholderTextColor="#8E8E93"
              style={styles.searchInput}
              clearButtonMode="while-editing"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searchQuery.length > 0 && Platform.OS === 'android' && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x-circle" size={16} color="#8E8E93" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Categories Horizontal Scroll */}
        <View style={styles.categoryContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryContent}
          >
            {categories.map((c) => {
              const active = category === c;
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => setCategory(c)}
                  style={[styles.categoryPill, active && styles.categoryPillActive]}
                >
                  <Text style={[styles.categoryText, active && styles.categoryTextActive]}>
                    {c}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Menu Items Grid */}
        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#E65100" />
            <Text style={styles.loadingText}>Loading menu...</Text>
          </View>
        ) : visible.length === 0 ? (
          <View style={styles.centerContainer}>
            <Text style={styles.emptyText}>No items found.</Text>
          </View>
        ) : (
          <FlatList
            data={visible}
            keyExtractor={(item) => item.id}
            numColumns={2}
            refreshing={isLoading}
            onRefresh={loadMenu}
            contentContainerStyle={[
              styles.menuList,
              { paddingBottom: count > 0 ? trayHeight + 24 : 24 },
            ]}
            renderItem={({ item }) => {
              const isBlocked = !item.is_available;
              const qty = cart[item.id] ?? 0;

              return (
                <View
                  style={[
                    styles.card,
                    qty > 0 && styles.cardActive,
                    isBlocked && styles.cardBlocked,
                  ]}
                >
                  <TouchableOpacity
                    style={styles.cardContent}
                    onPress={() => bump(item, 1)}
                    activeOpacity={isBlocked ? 0.9 : 0.7}
                  >
                    {isBlocked && (
                      <View style={styles.blockedBadge}>
                        <MaterialIcons name="block" size={12} color="#D32F2F" />
                        <Text style={styles.blockedBadgeText}>Blocked in Menu</Text>
                      </View>
                    )}

                    <Text
                      style={[styles.itemName, isBlocked && styles.itemNameBlocked]}
                      numberOfLines={2}
                    >
                      {item.name}
                    </Text>
                    <Text style={styles.itemCategory}>{item.category}</Text>
                    <Text
                      style={[styles.itemPrice, isBlocked && styles.itemPriceBlocked]}
                    >
                      {formatMoney(item.price)}
                    </Text>
                  </TouchableOpacity>

                  {!isBlocked && qty > 0 && (
                    <View style={styles.counterRow}>
                      <TouchableOpacity
                        onPress={() => bump(item, -1)}
                        style={styles.counterBtn}
                      >
                        <Feather name="minus" size={16} color="#333" />
                      </TouchableOpacity>
                      <Text style={styles.qtyText}>{qty}</Text>
                      <TouchableOpacity
                        onPress={() => bump(item, 1)}
                        style={[styles.counterBtn, styles.counterBtnAdd]}
                      >
                        <Feather name="plus" size={16} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                  )}

                  {isBlocked && (
                    <View style={styles.blockedFooter}>
                      <Feather name="lock" size={13} color="#9E9E9E" />
                      <Text style={styles.blockedFooterText}>Disabled</Text>
                    </View>
                  )}
                </View>
              );
            }}
          />
        )}

        {/* Bottom Cart Tray */}
        {count > 0 && (
          <View
            style={styles.tray}
            onLayout={(e) => setTrayHeight(e.nativeEvent.layout.height)}
          >
            <TouchableOpacity
              style={styles.trayHeader}
              onPress={() => setTrayOpen(!trayOpen)}
              activeOpacity={0.8}
            >
              <View style={styles.trayHeaderLeft}>
                <Feather name="shopping-bag" size={20} color="#E65100" />
                <Text style={styles.trayCount}>
                  {count} item{count === 1 ? '' : 's'}
                </Text>
                {editingOrderId && <Text style={styles.editPill}>Editing Mode</Text>}
              </View>
              <View style={styles.trayHeaderRight}>
                <Text style={styles.trayTotal}>{formatMoney(total)}</Text>
                <Feather
                  name={trayOpen ? 'chevron-down' : 'chevron-up'}
                  size={18}
                  color="#666"
                />
              </View>
            </TouchableOpacity>

            {trayOpen && (
              <View style={styles.trayBody}>
                <ScrollView style={styles.linesList}>
                  {lines.map((l) => (
                    <View key={l.item.id} style={styles.lineRow}>
                      <Text style={styles.lineName} numberOfLines={1}>
                        {l.quantity} × {l.item.name}
                      </Text>
                      <View style={styles.lineRight}>
                        <Text style={styles.linePrice}>
                          {formatMoney(l.item.price * l.quantity)}
                        </Text>
                        <TouchableOpacity onPress={() => bump(l.item, -l.quantity)}>
                          <Feather name="trash-2" size={16} color="#888" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </ScrollView>

                <View style={styles.inputRow}>
                  <TextInput
                    value={tableNumber}
                    onChangeText={setTableNumber}
                    placeholder="Table no."
                    keyboardType="numeric"
                    style={[styles.input, { flex: 1 }]}
                  />
                  <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Notes (less sugar...)"
                    style={[styles.input, { flex: 2 }]}
                  />
                </View>

                {editingOrderId && (
                  <TouchableOpacity
                    style={styles.cancelEditBtn}
                    onPress={handleCancelEdit}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.cancelEditText}>Cancel Edit</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.sendBtn,
                editingOrderId && styles.updateBtn,
                isSubmitting && styles.sendBtnDisabled,
              ]}
              onPress={handleSendOrder}
              disabled={isSubmitting}
              activeOpacity={0.8}
            >
              <Feather name={editingOrderId ? 'check' : 'send'} size={18} color="#FFF" />
              <Text style={styles.sendBtnText}>
                {isSubmitting
                  ? 'Saving...'
                  : editingOrderId
                  ? 'Update Order in Kitchen'
                  : 'Send to Kitchen'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Active Orders Picker Modal */}
        <Modal visible={recentOrdersModalOpen} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Active Kitchen Tickets</Text>
                <TouchableOpacity onPress={() => setRecentOrdersModalOpen(false)}>
                  <Feather name="x" size={22} color="#666" />
                </TouchableOpacity>
              </View>

              {isLoadingActive ? (
                <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#E65100" />
                </View>
              ) : activeOrders.length === 0 ? (
                <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                  <Text style={styles.emptyText}>No active orders right now.</Text>
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 380 }}>
                  {activeOrders.map((order) => (
                    <View key={order.id} style={styles.orderListItem}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.orderListTable}>
                          {order.table_number ? `Table ${order.table_number}` : 'Counter'} —{' '}
                          <Text style={styles.orderStatusBadge}>
                            {order.status}
                          </Text>
                        </Text>
                        <Text style={styles.orderListSummary} numberOfLines={2}>
                          {order.order_items
                            .map((i) => `${i.quantity}x ${i.item_name}`)
                            .join(', ')}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.editOrderBtn}
                        onPress={() => handleEditOrder(order)}
                        activeOpacity={0.8}
                      >
                        <Feather name="edit" size={15} color="#FFF" />
                        <Text style={styles.editOrderBtnText}>Edit</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#1A1A1A' },
  headerSubtitle: { fontSize: 13, color: '#666', marginTop: 2 },
  activeOrdersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF1E8',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
  },
  activeOrdersText: { fontSize: 13, fontWeight: '700', color: '#E65100' },
  searchWrapper: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 6 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#1A1A1A', paddingVertical: 0 },
  categoryContainer: { height: 48, marginVertical: 6 },
  categoryContent: { paddingHorizontal: 16, alignItems: 'center', gap: 8 },
  categoryPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  categoryPillActive: { backgroundColor: '#E65100', borderColor: '#E65100' },
  categoryText: { fontSize: 13, fontWeight: '600', color: '#666' },
  categoryTextActive: { color: '#FFF' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 8, color: '#888', fontSize: 14 },
  emptyText: { color: '#888', fontSize: 14 },
  menuList: { paddingHorizontal: 12 },
  card: {
    flex: 1,
    margin: 4,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    justifyContent: 'space-between',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    minHeight: 125,
  },
  cardActive: { borderColor: '#E65100', backgroundColor: '#FFF8F4' },
  cardBlocked: {
    backgroundColor: '#F3F3F4',
    borderColor: '#D8D8D8',
    borderStyle: 'dashed',
    elevation: 0,
    shadowOpacity: 0,
  },
  cardContent: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: '700', color: '#222' },
  itemNameBlocked: { color: '#8E8E93', textDecorationLine: 'line-through' },
  itemCategory: { fontSize: 11, color: '#888', marginTop: 2 },
  itemPrice: { fontSize: 14, fontWeight: '700', color: '#E65100', marginTop: 8 },
  itemPriceBlocked: { color: '#A0A0A0' },
  blockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFEBEE',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 6,
  },
  blockedBadgeText: { fontSize: 10, fontWeight: '700', color: '#D32F2F', textTransform: 'uppercase' },
  blockedFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 10,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#E4E4E6',
  },
  blockedFooterText: { fontSize: 12, fontWeight: '600', color: '#8E8E93' },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  counterBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#EBEBEB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  counterBtnAdd: { backgroundColor: '#E65100' },
  qtyText: { fontSize: 15, fontWeight: '700', color: '#222' },
  tray: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#EEE',
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: -3 },
    shadowRadius: 8,
  },
  trayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  trayHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trayHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trayCount: { fontSize: 16, fontWeight: '600', color: '#222' },
  editPill: {
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: '#2E7D32',
    color: '#FFF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  trayTotal: { fontSize: 18, fontWeight: '700', color: '#111' },
  trayBody: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 10 },
  linesList: { maxHeight: 120 },
  lineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  lineName: { fontSize: 14, color: '#333', flex: 1 },
  lineRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  linePrice: { fontSize: 14, fontWeight: '600', color: '#222' },
  inputRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  input: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
  },
  cancelEditBtn: { marginTop: 8, alignItems: 'center', paddingVertical: 4 },
  cancelEditText: { color: '#E53935', fontWeight: '600', fontSize: 13 },
  sendBtn: {
    backgroundColor: '#E65100',
    borderRadius: 12,
    height: 48,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  updateBtn: { backgroundColor: '#2E7D32' },
  sendBtnDisabled: { opacity: 0.6 },
  sendBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  orderListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
    gap: 12,
  },
  orderListTable: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  orderStatusBadge: { textTransform: 'capitalize', color: '#E65100' },
  orderListSummary: { fontSize: 13, color: '#666', marginTop: 3 },
  editOrderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E65100',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  editOrderBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
});