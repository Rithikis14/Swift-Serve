import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import { Feather, FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchOrders, formatMoney, type Order } from '../lib/pos';

export default function AnalyticsScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const data = await fetchOrders();
      setOrders(data);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to fetch sales data');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const stats = useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const today = orders.filter((o) => new Date(o.created_at) >= startOfDay);
    const served = today.filter((o) => o.status === 'completed');
    const revenue = served.reduce((s, o) => s + Number(o.total_amount), 0);

    const byItem = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const order of served) {
      for (const line of order.order_items) {
        const key = line.item_name || line.menu_item_id || 'Unknown';
        const prev = byItem.get(key) ?? { name: line.item_name || 'Unknown', qty: 0, revenue: 0 };
        prev.qty += line.quantity;
        prev.revenue += line.quantity * Number(line.item_price);
        byItem.set(key, prev);
      }
    }

    const leaderboard = [...byItem.values()].sort((a, b) => b.qty - a.qty);
    const maxQty = leaderboard[0]?.qty ?? 1;

    return { revenue, ordersToday: today.length, served: served.length, leaderboard, maxQty };
  }, [orders]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Sales</Text>
          <Text style={styles.headerSubtitle}>Today's performance</Text>
        </View>

        {/* Metric Cards */}
        <View style={styles.statsGrid}>
          <StatCard
            icon={<FontAwesome5 name="rupee-sign" size={18} color="#E65100" />}
            label="Revenue today"
            value={formatMoney(stats.revenue)}
          />
          <StatCard
            icon={<MaterialCommunityIcons name="receipt-text-outline" size={20} color="#E65100" />}
            label="Orders served"
            value={`${stats.served} / ${stats.ordersToday}`}
          />
        </View>

        {/* Best Sellers Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Feather name="trending-up" size={20} color="#E65100" />
            <Text style={styles.sectionTitle}>Best sellers</Text>
          </View>

          {isLoading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="small" color="#E65100" />
              <Text style={styles.loadingText}>Crunching numbers...</Text>
            </View>
          ) : stats.leaderboard.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No completed orders yet today.</Text>
            </View>
          ) : (
            <View style={styles.listContainer}>
              {stats.leaderboard.map((row, idx) => {
                const percent = Math.min(100, Math.round((row.qty / stats.maxQty) * 100));
                return (
                  <View key={row.name} style={styles.itemCard}>
                    <View style={styles.itemTopRow}>
                      <View style={styles.itemLeft}>
                        <View style={styles.rankBadge}>
                          <Text style={styles.rankText}>{idx + 1}</Text>
                        </View>
                        <Text style={styles.itemName} numberOfLines={1}>
                          {row.name}
                        </Text>
                      </View>

                      <View style={styles.itemRight}>
                        <Text style={styles.itemQty}>{row.qty} sold</Text>
                        <Text style={styles.itemRevenue}>{formatMoney(row.revenue)}</Text>
                      </View>
                    </View>

                    {/* Progress Bar */}
                    <View style={styles.progressBarBackground}>
                      <View style={[styles.progressBarFill, { width: `${percent}%` }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={styles.iconCircle}>{icon}</View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 16 },
  headerTitle: { fontSize: 26, fontWeight: '700', color: '#1A1A1A' },
  headerSubtitle: { fontSize: 13, color: '#666', marginTop: 2 },
  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  statCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FFF1E8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statValue: { fontSize: 22, fontWeight: '700', color: '#1A1A1A', marginTop: 12 },
  statLabel: { fontSize: 12, color: '#666', marginTop: 2 },
  section: { marginTop: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  centerBox: { paddingVertical: 40, alignItems: 'center' },
  loadingText: { marginTop: 8, fontSize: 13, color: '#888' },
  emptyBox: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  emptyText: { color: '#888', fontSize: 14 },
  listContainer: { gap: 10 },
  itemCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
  },
  itemTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankText: { fontSize: 13, fontWeight: '700', color: '#444' },
  itemName: { fontSize: 15, fontWeight: '600', color: '#222', flex: 1 },
  itemRight: { alignItems: 'flex-end', marginLeft: 8 },
  itemQty: { fontSize: 14, fontWeight: '700', color: '#111' },
  itemRevenue: { fontSize: 12, color: '#777', marginTop: 1 },
  progressBarBackground: {
    height: 6,
    backgroundColor: '#EBEBEB',
    borderRadius: 3,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#E65100',
    borderRadius: 3,
  },
});