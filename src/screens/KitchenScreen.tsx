import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Modal,
  TextInput,
} from 'react-native';
import { Feather, Ionicons, MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import {
  fetchOrders,
  formatMoney,
  timeAgo,
  updateOrderStatus,
  rejectOrder,
  rejectOrderItem,
  type Order,
  type OrderItem,
  type OrderStatus,
} from '../lib/pos';

const FILTERS: { key: OrderStatus | 'active'; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'pending', label: 'Pending' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

const PRESET_REASONS = [
  'Out of Stock / Ingredients Finished',
  'High Order Volume / Kitchen Busy',
  'Equipment Issue / Machine Down',
  'Item Unavailable Right Now',
];

type RejectTarget =
  | { type: 'order'; orderId: string; title: string }
  | { type: 'item'; orderId: string; item: OrderItem };

export default function KitchenScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<OrderStatus | 'active'>('active');
  const [soundOn, setSoundOn] = useState(true);
  const [flashIds, setFlashIds] = useState<string[]>([]);
  const [, setTick] = useState(0);

  // Reject Modal State
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null);
  const [selectedReason, setSelectedReason] = useState<string>(PRESET_REASONS[0]);
  const [customReason, setCustomReason] = useState<string>('');
  const [isOtherSelected, setIsOtherSelected] = useState<boolean>(false);
  const [isSubmittingReject, setIsSubmittingReject] = useState<boolean>(false);

  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  const loadOrders = async () => {
    try {
      const data = await fetchOrders();
      setOrders(data);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to fetch orders');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();

    const channel = supabase
      .channel('kds-orders-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          loadOrders();
          if (payload.eventType === 'INSERT') {
            const id = (payload.new as { id: string }).id;
            setFlashIds((prev) => [...prev, id]);
            setTimeout(() => {
              setFlashIds((prev) => prev.filter((x) => x !== id));
            }, 4000);

            if (soundRef.current) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_items' },
        () => {
          loadOrders();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, []);

  const handleAdvance = async (id: string, status: OrderStatus) => {
    try {
      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, status } : o))
      );
      await updateOrderStatus(id, status);
    } catch (err: any) {
      Alert.alert('Update Failed', err.message || 'Could not update order');
      loadOrders();
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectTarget) return;

    const finalReason = isOtherSelected
      ? customReason.trim() || 'No reason provided'
      : selectedReason;

    try {
      setIsSubmittingReject(true);

      if (rejectTarget.type === 'order') {
        await rejectOrder(rejectTarget.orderId, finalReason);
      } else {
        await rejectOrderItem(
          rejectTarget.orderId,
          rejectTarget.item.id,
          rejectTarget.item.item_price,
          rejectTarget.item.quantity,
          `${rejectTarget.item.item_name}: ${finalReason}`
        );
      }

      setRejectTarget(null);
      setCustomReason('');
      setIsOtherSelected(false);
      setSelectedReason(PRESET_REASONS[0]);
      await loadOrders();
      Alert.alert('Rejected', 'Ticket was updated');
    } catch (err: any) {
      Alert.alert('Action Failed', err.message || 'Could not process rejection');
    } finally {
      setIsSubmittingReject(false);
    }
  };

  const openRejectModal = (target: RejectTarget) => {
    setRejectTarget(target);
    setIsOtherSelected(false);
    setSelectedReason(PRESET_REASONS[0]);
    setCustomReason('');
  };

  const openTicketCount = useMemo(
    () => orders.filter((o) => o.status !== 'completed' && o.status !== 'cancelled').length,
    [orders]
  );

  const visible = useMemo(
    () =>
      orders.filter((o) => {
        if (filter === 'active') {
          return o.status !== 'completed' && o.status !== 'cancelled';
        }
        return o.status === filter;
      }),
    [orders, filter]
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Kitchen Display</Text>
          <Text style={styles.headerSubtitle}>{openTicketCount} active ticket(s)</Text>
        </View>
        <TouchableOpacity
          onPress={() => setSoundOn((s) => !s)}
          style={styles.soundButton}
          activeOpacity={0.7}
        >
          <Feather
            name={soundOn ? 'bell' : 'bell-off'}
            size={20}
            color={soundOn ? '#E65100' : '#888'}
          />
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContent}
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.filterPill, active && styles.filterPillActive]}
              >
                <Text
                  style={[styles.filterPillText, active && styles.filterPillTextActive]}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Tickets List */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#E65100" />
          <Text style={styles.loadingText}>Loading tickets...</Text>
        </View>
      ) : visible.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No tickets under this view.</Text>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Ticket
              order={item}
              flash={flashIds.includes(item.id)}
              onAdvance={(status) => handleAdvance(item.id, status)}
              onRejectOrder={() =>
                openRejectModal({
                  type: 'order',
                  orderId: item.id,
                  title: item.table_number ? `Table ${item.table_number}` : 'Counter Order',
                })
              }
              onRejectItem={(orderItem) =>
                openRejectModal({
                  type: 'item',
                  orderId: item.id,
                  item: orderItem,
                })
              }
            />
          )}
        />
      )}

      {/* Reject Modal */}
      <Modal visible={rejectTarget !== null} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  {rejectTarget?.type === 'order' ? 'Reject Entire Order' : 'Reject Item from Ticket'}
                </Text>
                <Text style={styles.modalSubtitle} numberOfLines={1}>
                  {rejectTarget?.type === 'order'
                    ? rejectTarget.title
                    : rejectTarget?.item.item_name}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setRejectTarget(null)}>
                <Feather name="x" size={22} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            <Text style={styles.reasonSectionTitle}>Select Reason:</Text>

            <View style={styles.presetContainer}>
              {PRESET_REASONS.map((reason) => {
                const isSelected = !isOtherSelected && selectedReason === reason;
                return (
                  <TouchableOpacity
                    key={reason}
                    style={[styles.reasonOption, isSelected && styles.reasonOptionActive]}
                    onPress={() => {
                      setIsOtherSelected(false);
                      setSelectedReason(reason);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.radioCircle, isSelected && styles.radioCircleActive]} />
                    <Text style={[styles.reasonText, isSelected && styles.reasonTextActive]}>
                      {reason}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                style={[styles.reasonOption, isOtherSelected && styles.reasonOptionActive]}
                onPress={() => setIsOtherSelected(true)}
                activeOpacity={0.8}
              >
                <View style={[styles.radioCircle, isOtherSelected && styles.radioCircleActive]} />
                <Text style={[styles.reasonText, isOtherSelected && styles.reasonTextActive]}>
                  Other / Custom Note
                </Text>
              </TouchableOpacity>
            </View>

            {isOtherSelected && (
              <TextInput
                value={customReason}
                onChangeText={setCustomReason}
                placeholder="Type explanation..."
                placeholderTextColor="#666"
                multiline
                numberOfLines={3}
                style={styles.customInput}
              />
            )}

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setRejectTarget(null)}
              >
                <Text style={styles.cancelModalText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmRejectBtn, isSubmittingReject && { opacity: 0.6 }]}
                onPress={handleConfirmReject}
                disabled={isSubmittingReject}
              >
                <Text style={styles.confirmRejectText}>
                  {isSubmittingReject ? 'Rejecting...' : 'Confirm Reject'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Ticket({
  order,
  flash,
  onAdvance,
  onRejectOrder,
  onRejectItem,
}: {
  order: Order;
  flash: boolean;
  onAdvance: (status: OrderStatus) => void;
  onRejectOrder: () => void;
  onRejectItem: (item: OrderItem) => void;
}) {
  const badgeStyles = getBadgeStyles(order.status);
  const isActionable = order.status === 'pending' || order.status === 'preparing';

  return (
    <View style={[styles.ticketCard, flash && styles.ticketFlash]}>
      <View style={styles.ticketHeader}>
        <View>
          <Text style={styles.tableTitle}>
            {order.table_number ? `Table ${order.table_number}` : 'Counter'}
          </Text>
          <View style={styles.timeRow}>
            <Feather name="clock" size={12} color="#8E8E93" />
            <Text style={styles.timeText}>{timeAgo(order.created_at)}</Text>
          </View>
        </View>
        <View style={[styles.statusBadge, badgeStyles.badge]}>
          <Text style={[styles.statusBadgeText, badgeStyles.badgeText]}>
            {order.status}
          </Text>
        </View>
      </View>

      <View style={styles.itemsDivider}>
        {order.order_items.map((line) => (
          <View key={line.id} style={styles.lineRow}>
            <View style={styles.qtyBadge}>
              <Text style={styles.qtyText}>{line.quantity}</Text>
            </View>
            <Text style={styles.lineItemName}>{line.item_name}</Text>

            {isActionable && (
              <TouchableOpacity
                onPress={() => onRejectItem(line)}
                style={styles.itemRejectBtn}
                activeOpacity={0.7}
              >
                <MaterialIcons name="cancel" size={18} color="#FF453A" />
                <Text style={styles.itemRejectText}>Reject</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>

      {order.notes ? (
        <View style={styles.notesBox}>
          <Text style={styles.notesText}>“{order.notes}”</Text>
        </View>
      ) : null}

      <View style={styles.ticketFooter}>
        <Text style={styles.totalText}>{formatMoney(order.total_amount)}</Text>

        <View style={styles.actionsRow}>
          {isActionable && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn]}
              onPress={onRejectOrder}
              activeOpacity={0.8}
            >
              <MaterialIcons name="close" size={16} color="#FFF" />
              <Text style={styles.actionBtnText}>Reject All</Text>
            </TouchableOpacity>
          )}

          {order.status === 'pending' && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.acceptBtn]}
              onPress={() => onAdvance('preparing')}
              activeOpacity={0.8}
            >
              <Ionicons name="flame" size={16} color="#FFF" />
              <Text style={styles.actionBtnText}>Accept</Text>
            </TouchableOpacity>
          )}

          {order.status === 'preparing' && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.readyBtn]}
              onPress={() => onAdvance('completed')}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark-done" size={16} color="#FFF" />
              <Text style={styles.actionBtnText}>Mark Ready</Text>
            </TouchableOpacity>
          )}

          {order.status === 'completed' && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.reopenBtn]}
              onPress={() => onAdvance('preparing')}
              activeOpacity={0.8}
            >
              <Text style={styles.reopenBtnText}>Reopen</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

function getBadgeStyles(status: OrderStatus) {
  switch (status) {
    case 'pending':
      return { badge: { backgroundColor: '#FFCC00' }, badgeText: { color: '#000' } };
    case 'preparing':
      return { badge: { backgroundColor: '#FF9500' }, badgeText: { color: '#FFF' } };
    case 'completed':
      return { badge: { backgroundColor: '#34C759' }, badgeText: { color: '#FFF' } };
    case 'cancelled':
      return { badge: { backgroundColor: '#FF453A' }, badgeText: { color: '#FFF' } };
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#FFF' },
  headerSubtitle: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  soundButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterContainer: { height: 48, marginVertical: 8 },
  filterContent: { paddingHorizontal: 16, alignItems: 'center', gap: 8 },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  filterPillActive: { backgroundColor: '#E65100', borderColor: '#E65100' },
  filterPillText: { fontSize: 13, fontWeight: '600', color: '#8E8E93' },
  filterPillTextActive: { color: '#FFF' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 8, color: '#8E8E93', fontSize: 14 },
  emptyText: { color: '#8E8E93', fontSize: 14 },
  listContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  ticketCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  ticketFlash: {
    borderColor: '#E65100',
    backgroundColor: '#261B14',
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  tableTitle: { fontSize: 20, fontWeight: '700', color: '#FFF' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  timeText: { fontSize: 12, color: '#8E8E93' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  itemsDivider: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#2C2C2E',
    paddingVertical: 12,
    marginVertical: 12,
    gap: 10,
  },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyBadge: {
    backgroundColor: '#2C2C2E',
    borderRadius: 8,
    minWidth: 32,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  qtyText: { fontSize: 15, fontWeight: '700', color: '#E65100' },
  lineItemName: { fontSize: 16, fontWeight: '600', color: '#FFF', flex: 1 },
  itemRejectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#351817',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  itemRejectText: { color: '#FF453A', fontSize: 12, fontWeight: '600' },
  notesBox: {
    backgroundColor: '#252528',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  notesText: { color: '#B0B0B5', fontSize: 13, fontStyle: 'italic' },
  ticketFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalText: { fontSize: 15, fontWeight: '700', color: '#8E8E93' },
  actionsRow: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  rejectBtn: { backgroundColor: '#FF453A' },
  acceptBtn: { backgroundColor: '#FF9500' },
  readyBtn: { backgroundColor: '#34C759' },
  reopenBtn: {
    borderWidth: 1,
    borderColor: '#3A3A3C',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  actionBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  reopenBtnText: { color: '#8E8E93', fontWeight: '600', fontSize: 14 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 19, fontWeight: '700', color: '#FFF' },
  modalSubtitle: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  reasonSectionTitle: { fontSize: 13, fontWeight: '600', color: '#8E8E93', marginBottom: 10 },
  presetContainer: { gap: 8, marginBottom: 14 },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252528',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    gap: 12,
  },
  reasonOptionActive: {
    borderColor: '#E65100',
    backgroundColor: '#2A1F18',
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#666',
  },
  radioCircleActive: {
    borderColor: '#E65100',
    backgroundColor: '#E65100',
  },
  reasonText: { fontSize: 14, color: '#CCCCCC', flex: 1 },
  reasonTextActive: { color: '#FFF', fontWeight: '600' },
  customInput: {
    backgroundColor: '#252528',
    borderRadius: 12,
    padding: 12,
    color: '#FFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#3A3A3C',
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  cancelModalBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  cancelModalText: { color: '#8E8E93', fontWeight: '600' },
  confirmRejectBtn: {
    backgroundColor: '#FF453A',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  confirmRejectText: { color: '#FFF', fontWeight: '700' },
});