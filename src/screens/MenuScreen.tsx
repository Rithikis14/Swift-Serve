import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { CATEGORIES, fetchMenuItems, formatMoney, type MenuItem } from '../lib/pos';

type Draft = {
  id?: string;
  name: string;
  price: string;
  category: string;
  is_available: boolean;
};

const EMPTY: Draft = {
  name: '',
  price: '',
  category: 'Tea',
  is_available: true,
};

export default function MenuScreen() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadMenu = async () => {
    try {
      setIsLoading(true);
      const data = await fetchMenuItems();
      setItems(data);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load menu');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMenu();
  }, []);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase().trim();
    return items.filter(
      (i) => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  const activeCategories = useMemo(() => {
    return CATEGORIES.filter((c) => filteredItems.some((i) => i.category === c));
  }, [filteredItems]);

  const handleSave = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    const price = Number(draft.price);

    if (!name) {
      Alert.alert('Validation Error', 'Item name is required');
      return;
    }
    if (isNaN(price) || price < 0) {
      Alert.alert('Validation Error', 'Please enter a valid price');
      return;
    }

    try {
      setIsSaving(true);
      const payload = {
        name,
        price,
        category: draft.category,
        is_available: draft.is_available,
      };

      if (draft.id) {
        const { error } = await supabase.from('menu_items').update(payload).eq('id', draft.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('menu_items').insert(payload);
        if (error) throw error;
      }

      setDraft(null);
      await loadMenu();
      Alert.alert('Success', 'Menu item saved');
    } catch (err: any) {
      Alert.alert('Could not save', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (item: MenuItem) => {
  const nextState = !item.is_available;

  // 1. Instant optimistic update on Menu Screen
  setItems((prev) =>
    prev.map((i) => (i.id === item.id ? { ...i, is_available: nextState } : i))
  );

  // 2. Commit to Supabase (Realtime broadcasts this out immediately)
  try {
    const { error } = await supabase
      .from('menu_items')
      .update({ is_available: nextState })
      .eq('id', item.id);

    if (error) throw error;
  } catch (err: any) {
    Alert.alert('Toggle failed', err.message);
    loadMenu(); // Rollback on failure
  }
};

  const handleDelete = (item: MenuItem) => {
    Alert.alert('Delete Item', `Remove "${item.name}" from the menu completely?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('menu_items').delete().eq('id', item.id);
            if (error) throw error;
            loadMenu();
          } catch (err: any) {
            Alert.alert('Could not delete', err.message);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Menu Management</Text>
          <Text style={styles.headerSubtitle}>{items.length} item(s) available</Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setDraft(EMPTY)}
          activeOpacity={0.8}
        >
          <Feather name="plus" size={18} color="#FFF" />
          <Text style={styles.addButtonText}>New</Text>
        </TouchableOpacity>
      </View>

      {/* Menu Search Bar */}
      <View style={styles.searchWrapper}>
        <View style={styles.searchBar}>
          <Feather name="search" size={18} color="#8E8E93" style={styles.searchIcon} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search items to edit or toggle..."
            placeholderTextColor="#8E8E93"
            style={styles.searchInput}
            clearButtonMode="while-editing"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && Platform.OS === 'android' && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Feather name="x-circle" size={16} color="#8E8E93" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Item List by Category */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#E65100" />
          <Text style={styles.loadingText}>Loading menu...</Text>
        </View>
      ) : activeCategories.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No menu items matched your search.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {activeCategories.map((cat) => (
            <View key={cat} style={styles.categoryBlock}>
              <Text style={styles.categoryHeader}>{cat.toUpperCase()}</Text>
              <View style={styles.categoryCardGroup}>
                {filteredItems
                  .filter((i) => i.category === cat)
                  .map((item) => (
                    <View key={item.id} style={styles.menuItemCard}>
                      <View style={styles.itemInfo}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        <Text style={styles.itemPrice}>{formatMoney(item.price)}</Text>
                      </View>

                      <View style={styles.itemActions}>
                        <TouchableOpacity
                          onPress={() => handleToggle(item)}
                          style={[
                            styles.statusPill,
                            item.is_available ? styles.statusPillOn : styles.statusPillOff,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusPillText,
                              item.is_available ? styles.statusTextOn : styles.statusTextOff,
                            ]}
                          >
                            {item.is_available ? 'ON' : 'OFF'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.iconBtn}
                          onPress={() =>
                            setDraft({
                              id: item.id,
                              name: item.name,
                              price: String(item.price),
                              category: item.category,
                              is_available: item.is_available,
                            })
                          }
                        >
                          <Feather name="edit-2" size={16} color="#666" />
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.iconBtn}
                          onPress={() => handleDelete(item)}
                        >
                          <Feather name="trash-2" size={16} color="#E53935" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Add / Edit Form Modal */}
      <Modal visible={draft !== null} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {draft?.id ? 'Edit Item' : 'Add Item'}
              </Text>
              <TouchableOpacity onPress={() => setDraft(null)}>
                <Feather name="x" size={22} color="#666" />
              </TouchableOpacity>
            </View>

            {draft && (
              <ScrollView style={styles.modalForm}>
                <Text style={styles.inputLabel}>Item Name</Text>
                <TextInput
                  value={draft.name}
                  onChangeText={(val) => setDraft({ ...draft, name: val })}
                  placeholder="e.g. Masala Dosa"
                  style={styles.input}
                />

                <Text style={styles.inputLabel}>Price (₹)</Text>
                <TextInput
                  value={draft.price}
                  onChangeText={(val) => setDraft({ ...draft, price: val })}
                  placeholder="0.00"
                  keyboardType="numeric"
                  style={styles.input}
                />

                <Text style={styles.inputLabel}>Category</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.categorySelectScroll}
                >
                  {CATEGORIES.map((c) => {
                    const selected = draft.category === c;
                    return (
                      <TouchableOpacity
                        key={c}
                        onPress={() => setDraft({ ...draft, category: c })}
                        style={[
                          styles.catSelectPill,
                          selected && styles.catSelectPillActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.catSelectText,
                            selected && styles.catSelectTextActive,
                          ]}
                        >
                          {c}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Available for ordering</Text>
                  <Switch
                    value={draft.is_available}
                    onValueChange={(val) => setDraft({ ...draft, is_available: val })}
                    trackColor={{ false: '#D1D1D6', true: '#FFCC80' }}
                    thumbColor={draft.is_available ? '#E65100' : '#FFF'}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
                  onPress={handleSave}
                  disabled={isSaving}
                  activeOpacity={0.8}
                >
                  <Text style={styles.saveButtonText}>
                    {isSaving ? 'Saving...' : 'Save Item'}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#1A1A1A' },
  headerSubtitle: { fontSize: 13, color: '#666', marginTop: 2 },
  addButton: {
    backgroundColor: '#E65100',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
  },
  addButtonText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  searchWrapper: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#1A1A1A', paddingVertical: 0 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 8, color: '#888', fontSize: 14 },
  emptyText: { color: '#888', fontSize: 14 },
  listContent: { padding: 16, paddingBottom: 40 },
  categoryBlock: { marginBottom: 20 },
  categoryHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#8E8E93',
    marginBottom: 8,
    marginLeft: 4,
  },
  categoryCardGroup: { gap: 8 },
  menuItemCard: {
    backgroundColor: '#FFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
  },
  itemInfo: { flex: 1, paddingRight: 8 },
  itemName: { fontSize: 15, fontWeight: '600', color: '#222' },
  itemPrice: { fontSize: 14, fontWeight: '700', color: '#E65100', marginTop: 2 },
  itemActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  statusPillOn: { backgroundColor: '#E8F5E9' },
  statusPillOff: { backgroundColor: '#EEEEEE' },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  statusTextOn: { color: '#2E7D32' },
  statusTextOff: { color: '#757575' },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF',
  },
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
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  modalForm: { marginVertical: 4 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  categorySelectScroll: { gap: 8, paddingVertical: 4 },
  catSelectPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  catSelectPillActive: { backgroundColor: '#E65100', borderColor: '#E65100' },
  catSelectText: { fontSize: 13, fontWeight: '600', color: '#666' },
  catSelectTextActive: { color: '#FFF' },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 18,
    paddingHorizontal: 4,
  },
  switchLabel: { fontSize: 15, fontWeight: '600', color: '#222' },
  saveButton: {
    backgroundColor: '#E65100',
    borderRadius: 12,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});