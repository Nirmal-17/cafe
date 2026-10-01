import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SectionList,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { api, MenuItem, MenuCategory } from '../services/api';
import { Hoverable } from '@/components/Hoverable';

const BRAND_PRIMARY = '#073F78';
const THEME_ORANGE = '#FF6D00';
const BRAND_YELLOW = '#FFD600';
const BG_PAGE = '#F0F4FF';
const BG_SURFACE = '#FFFFFF';
const BORDER_COLOR = '#CBD5E1';
const TEXT_DARK = '#0F172A';
const TEXT_MUTED = '#64748B';
const COLOR_SUCCESS = '#16A34A';
const COLOR_ERROR = '#DC2626';

interface MenuBrowserProps {
  onSelectItem?: (item: MenuItem) => void;
  showOrderActions?: boolean;
}

interface FlatMenuItem {
  item: MenuItem;
  categoryName: string;
}

interface MenuSection {
  categoryId: number;
  title: string;
  data: FlatMenuItem[];
}

const getVegFlag = (item: MenuItem): boolean | null => {
  if (item.isVeg !== undefined) return Boolean(item.isVeg);
  if (item.is_veg !== undefined) return Boolean(item.is_veg);
  if (item.veg !== undefined) return Boolean(item.veg);
  if (typeof item.type === 'string') {
    const t = item.type.toUpperCase();
    if (t === 'VEG' || t === 'VEGETARIAN') return true;
    if (t === 'NON_VEG' || t === 'NON-VEG' || t === 'NON_VEGETARIAN') return false;
  }
  if (typeof item.itemType === 'string') {
    const t = item.itemType.toUpperCase();
    if (t === 'VEG' || t === 'VEGETARIAN') return true;
    if (t === 'NON_VEG' || t === 'NON-VEG' || t === 'NON_VEGETARIAN') return false;
  }
  return null;
};

const isSpicyItem = (item: MenuItem): boolean => {
  if (item.isSpicy !== undefined) return Boolean(item.isSpicy);
  if (item.is_spicy !== undefined) return Boolean(item.is_spicy);
  if (item.spicy !== undefined) return Boolean(item.spicy);
  return false;
};

const MenuItemCard = memo(function MenuItemCard({
  entry,
  currencySymbol,
  onPress,
}: {
  entry: FlatMenuItem;
  currencySymbol: string;
  onPress: (item: MenuItem, categoryName: string) => void;
}) {
  const { item, categoryName } = entry;
  const vegFlag = getVegFlag(item);
  const spicy = isSpicyItem(item);

  return (
    <TouchableOpacity
      style={styles.itemCard}
      onPress={() => onPress(item, categoryName)}
      activeOpacity={0.75}
    >
      <View style={styles.itemCardLeft}>
        <View style={styles.itemNameRow}>
          {vegFlag !== null && (
            <View
              style={[
                styles.vegDot,
                { borderColor: vegFlag ? COLOR_SUCCESS : COLOR_ERROR },
              ]}
            >
              <View
                style={[
                  styles.vegDotInner,
                  { backgroundColor: vegFlag ? COLOR_SUCCESS : COLOR_ERROR },
                ]}
              />
            </View>
          )}
          <Text style={styles.itemName} numberOfLines={1}>
            {item.name}
          </Text>
          {spicy && (
            <MaterialCommunityIcons
              name="fire"
              size={14}
              color={THEME_ORANGE}
              style={{ marginLeft: 4 }}
            />
          )}
        </View>
        <View style={styles.itemMetaRow}>
          <View
            style={[
              styles.stockPill,
              { backgroundColor: item.available ? '#ECFDF5' : '#FEF2F2' },
            ]}
          >
            <Text
              style={[
                styles.stockPillText,
                { color: item.available ? COLOR_SUCCESS : COLOR_ERROR },
              ]}
            >
              {item.available ? 'In Stock' : 'Out of Stock'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.itemCardRight}>
        <View style={styles.priceTag}>
          <Text style={styles.priceText}>
            {currencySymbol} {Number(item.price).toFixed(2)}
          </Text>
        </View>
        <MaterialIcons name="chevron-right" size={20} color={TEXT_MUTED} />
      </View>
    </TouchableOpacity>
  );
});

export const MenuBrowser = memo(function MenuBrowser({
  onSelectItem,
  showOrderActions = false,
}: MenuBrowserProps) {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currencySymbol, setCurrencySymbol] = useState<string>('NPR');

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [selectedItemCategory, setSelectedItemCategory] = useState<string>('');

  const fetchSettings = useCallback(async () => {
    try {
      const res = await api.getSettings();
      if (res.success && res.data) {
        const symbol = res.data.currencySymbol || 'NPR';
        setCurrencySymbol(symbol === '$' ? 'NPR' : symbol);
      }
    } catch {
      setCurrencySymbol('NPR');
    }
  }, []);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 250);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  const fetchMenu = useCallback(async () => {
    try {
      setError(null);
      const res = await api.getMenu();
      if (res.success && res.data) {
        setCategories(res.data);
      } else {
        setError(res.error || 'Failed to fetch menu items');
      }
    } catch {
      setError('Network error. Failed to load menu catalogue.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      if (active) {
        await Promise.all([fetchMenu(), fetchSettings()]);
      }
    };
    loadData();
    return () => {
      active = false;
    };
  }, [fetchMenu, fetchSettings]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchMenu();
  }, [fetchMenu]);

  const handleCardPress = useCallback((item: MenuItem, categoryName: string) => {
    setSelectedItem(item);
    setSelectedItemCategory(categoryName);
  }, []);

  const totalItemCount = useMemo(
    () => categories.reduce((sum, cat) => sum + (cat.items?.length || 0), 0),
    [categories]
  );

  const sections = useMemo<MenuSection[]>(() => {
    const query = debouncedSearchQuery.toLowerCase().trim();
    const result: MenuSection[] = [];

    for (const cat of categories) {
      if (selectedCategoryId !== null && cat.id !== selectedCategoryId) continue;
      const items = cat.items || [];
      const matched: FlatMenuItem[] = [];
      for (const item of items) {
        if (query) {
          const itemName = item.name.toLowerCase();
          const desc = (item.description || '').toLowerCase();
          const catName = cat.name.toLowerCase();
          if (!itemName.includes(query) && !catName.includes(query) && !desc.includes(query)) {
            continue;
          }
        }
        matched.push({ item, categoryName: cat.name });
      }
      if (matched.length > 0) {
        result.push({ categoryId: cat.id, title: cat.name, data: matched });
      }
    }
    return result;
  }, [categories, selectedCategoryId, debouncedSearchQuery]);

  const visibleCount = useMemo(
    () => sections.reduce((sum, s) => sum + s.data.length, 0),
    [sections]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: MenuSection }) => (
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <View style={styles.sectionAccent} />
          <Text style={styles.sectionTitle}>{section.title}</Text>
        </View>
        <View style={styles.sectionCountBadge}>
          <Text style={styles.sectionCountText}>{section.data.length}</Text>
        </View>
      </View>
    ),
    []
  );

  const renderItem = useCallback(
    ({ item: entry }: { item: FlatMenuItem }) => (
      <MenuItemCard
        entry={entry}
        currencySymbol={currencySymbol}
        onPress={handleCardPress}
      />
    ),
    [currencySymbol, handleCardPress]
  );

  const keyExtractor = useCallback((entry: FlatMenuItem, index: number) => {
    const parts = keyExtractorParts(entry, index);
    return parts;
  }, []);

  const listHeader = (
    <View>
      <LinearGradient
        colors={[BRAND_PRIMARY, '#0A5AA8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroTopRow}>
          <View style={styles.heroIcon}>
            <MaterialCommunityIcons name="silverware-fork-knife" size={20} color={BRAND_YELLOW} />
          </View>
          <View style={styles.heroCountWrap}>
            <Text style={styles.heroCountText}>
              {totalItemCount} item{totalItemCount === 1 ? '' : 's'}
            </Text>
          </View>
        </View>
        <Text style={styles.heroTitle}>Our Menu</Text>
        <Text style={styles.heroSubtitle}>
          Browse every dish with its price.
        </Text>

        <View style={styles.searchContainer}>
          <MaterialIcons name="search" size={20} color={TEXT_MUTED} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search dishes, categories..."
            placeholderTextColor={TEXT_MUTED}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery ? (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              style={styles.clearBtn}
              accessibilityLabel="Clear search"
            >
              <MaterialIcons name="close" size={18} color={TEXT_MUTED} />
            </TouchableOpacity>
          ) : null}
        </View>
      </LinearGradient>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        <TouchableOpacity
          style={[styles.chip, selectedCategoryId === null && styles.chipActive]}
          onPress={() => setSelectedCategoryId(null)}
          activeOpacity={0.8}
        >
          <Text
            style={[styles.chipText, selectedCategoryId === null && styles.chipTextActive]}
          >
            All
          </Text>
        </TouchableOpacity>

        {categories.map((cat) => {
          const isActive = selectedCategoryId === cat.id;
          return (
            <TouchableOpacity
              key={cat.id}
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => setSelectedCategoryId(isActive ? null : cat.id)}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                {cat.name}
                <Text style={[styles.chipCount, isActive && styles.chipCountActive]}>
                  {'  '}
                  {cat.items?.length || 0}
                </Text>
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {!loading && !error && (
        <View style={styles.resultRow}>
          <Text style={styles.resultText}>
            Showing {visibleCount} of {totalItemCount} items
          </Text>
          {debouncedSearchQuery || selectedCategoryId !== null ? (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
                setDebouncedSearchQuery('');
                setSelectedCategoryId(null);
              }}
            >
              <Text style={styles.resetText}>Reset filters</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {loading && (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={THEME_ORANGE} />
          <Text style={styles.loadingText}>Fetching menu items...</Text>
        </View>
      )}

      {error && !loading && (
        <View style={styles.centerBox}>
          <MaterialIcons name="cloud-off" size={48} color={COLOR_ERROR} />
          <Text style={styles.errorText}>{error}</Text>
          <Hoverable style={styles.retryBtn} onPress={onRefresh} hoverOpacity={0.8}>
            <MaterialIcons name="refresh" size={16} color="#fff" />
            <Text style={styles.retryBtnText}> Retry</Text>
          </Hoverable>
        </View>
      )}
    </View>
  );

  const listEmpty = !loading && !error ? (
    <View style={styles.centerBox}>
      <MaterialIcons name="search-off" size={48} color={TEXT_MUTED} />
      <Text style={styles.emptyTitle}>No items found</Text>
      <Text style={styles.emptySubtitle}>Try a different search or category.</Text>
    </View>
  ) : null;

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[THEME_ORANGE, BRAND_YELLOW]}
            tintColor={THEME_ORANGE}
          />
        }
        removeClippedSubviews={Platform.OS !== 'web'}
        maxToRenderPerBatch={12}
        windowSize={7}
        initialNumToRender={18}
        SectionSeparatorComponent={() => <View style={{ height: 4 }} />}
      />

      {selectedItem ? (
        <Modal
          visible={true}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setSelectedItem(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent} id="item-details-modal">
              <LinearGradient
                colors={[BRAND_PRIMARY, '#0A5AA8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.modalHero}
              >
                <View style={styles.modalHeroTop}>
                  <View style={styles.modalHeaderBadges}>
                    {getVegFlag(selectedItem) !== null && (
                      <View
                        style={[
                          styles.modalVegBadge,
                          {
                            backgroundColor: getVegFlag(selectedItem)
                              ? COLOR_SUCCESS
                              : COLOR_ERROR,
                          },
                        ]}
                      >
                        <Text style={styles.modalBadgeText}>
                          {getVegFlag(selectedItem) ? 'VEGETARIAN' : 'NON-VEGETARIAN'}
                        </Text>
                      </View>
                    )}
                    {isSpicyItem(selectedItem) && (
                      <View style={styles.modalSpicyBadge}>
                        <MaterialCommunityIcons name="fire" size={12} color="#fff" />
                        <Text style={styles.modalBadgeText}>SPICY</Text>
                      </View>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.modalCloseBtn}
                    onPress={() => setSelectedItem(null)}
                    id="modal-close-btn"
                    accessibilityLabel="Close item details"
                  >
                    <MaterialIcons name="close" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.modalHeroTitle}>{selectedItem.name}</Text>
                <View style={styles.modalHeroMeta}>
                  <View style={styles.modalHeroChip}>
                    <MaterialIcons name="restaurant-menu" size={12} color="#fff" />
                    <Text style={styles.modalHeroChipText}>{selectedItemCategory}</Text>
                  </View>
                  <View
                    style={[
                      styles.modalHeroChip,
                      { backgroundColor: selectedItem.available ? '#065F46' : '#7F1D1D' },
                    ]}
                  >
                    <Text style={styles.modalHeroChipText}>
                      {selectedItem.available ? 'In Stock' : 'Out of Stock'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.modalHeroPrice}>
                  {currencySymbol} {Number(selectedItem.price).toFixed(2)}
                </Text>
              </LinearGradient>

              <View style={styles.modalBody}>
                {showOrderActions && selectedItem.available && onSelectItem ? (
                  <Hoverable
                    style={styles.actionBtnPrimary}
                    onPress={() => {
                      onSelectItem(selectedItem);
                      setSelectedItem(null);
                    }}
                    hoverOpacity={0.8}
                    id="add-to-order-btn"
                  >
                    <MaterialIcons name="add-shopping-cart" size={18} color="#fff" />
                    <Text style={styles.actionBtnPrimaryText}>Add to Current Order</Text>
                  </Hoverable>
                ) : (
                  <Hoverable
                    style={styles.actionBtnSecondary}
                    onPress={() => setSelectedItem(null)}
                    hoverOpacity={0.8}
                    id="dismiss-btn"
                  >
                    <Text style={styles.actionBtnSecondaryText}>Go Back</Text>
                  </Hoverable>
                )}
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
});

function keyExtractorParts(entry: FlatMenuItem, index: number): string {
  return `${entry.item.id}-${index}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG_PAGE,
  },
  listContent: {
    paddingBottom: 90,
  },

  hero: {
    margin: 16,
    marginBottom: 12,
    borderRadius: 22,
    padding: 18,
    shadowColor: BRAND_PRIMARY,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 5,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroCountWrap: {
    backgroundColor: 'rgba(255, 109, 0, 0.95)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  heroCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 14,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BG_SURFACE,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 46,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: TEXT_DARK,
    height: '100%',
  },
  clearBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },

  chipsRow: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: BG_SURFACE,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer', transition: 'all 0.15s ease' }),
  },
  chipActive: {
    backgroundColor: THEME_ORANGE,
    borderColor: THEME_ORANGE,
    shadowColor: THEME_ORANGE,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_MUTED,
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  chipCount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  chipCountActive: {
    color: 'rgba(255,255,255,0.85)',
  },

  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 6,
  },
  resultText: {
    fontSize: 12,
    fontWeight: '600',
    color: TEXT_MUTED,
  },
  resetText: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME_ORANGE,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 8,
    backgroundColor: BG_PAGE,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionAccent: {
    width: 4,
    height: 18,
    borderRadius: 2,
    backgroundColor: THEME_ORANGE,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: BRAND_PRIMARY,
    letterSpacing: -0.2,
  },
  sectionCountBadge: {
    minWidth: 26,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 7,
    backgroundColor: '#E0E7FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: BRAND_PRIMARY,
  },

  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BG_SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginHorizontal: 16,
    marginBottom: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    }),
  },
  itemCardLeft: {
    flex: 1,
    marginRight: 10,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vegDot: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 7,
    backgroundColor: '#fff',
  },
  vegDotInner: {
    width: 6,
    height: 6,
    borderRadius: 1.5,
  },
  itemName: {
    fontSize: 15.5,
    fontWeight: '800',
    color: TEXT_DARK,
    flexShrink: 1,
  },
  itemMetaRow: {
    flexDirection: 'row',
    marginTop: 6,
    gap: 6,
  },
  stockPill: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  stockPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  itemCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  priceTag: {
    backgroundColor: '#FFF4E8',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#FFE0C2',
  },
  priceText: {
    fontSize: 14.5,
    fontWeight: '900',
    color: THEME_ORANGE,
    letterSpacing: -0.2,
  },

  centerBox: {
    paddingVertical: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
    color: TEXT_MUTED,
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    color: COLOR_ERROR,
    fontSize: 14,
    marginTop: 10,
    textAlign: 'center',
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '800',
    color: TEXT_DARK,
  },
  emptySubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: TEXT_MUTED,
  },
  retryBtn: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME_ORANGE,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 450,
    backgroundColor: '#fff',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  modalHero: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
  },
  modalHeroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalHeaderBadges: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalVegBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  modalSpicyBadge: {
    backgroundColor: '#B91C1C',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  modalBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  modalHeroTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  modalHeroMeta: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  modalHeroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  modalHeroChipText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  modalHeroPrice: {
    marginTop: 14,
    fontSize: 24,
    fontWeight: '900',
    color: BRAND_YELLOW,
    letterSpacing: -0.4,
  },
  modalBody: {
    padding: 18,
  },
  actionBtnPrimary: {
    backgroundColor: THEME_ORANGE,
    borderRadius: 14,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: THEME_ORANGE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  actionBtnPrimaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  actionBtnSecondary: {
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnSecondaryText: {
    color: TEXT_DARK,
    fontSize: 14,
    fontWeight: '700',
  },
});
