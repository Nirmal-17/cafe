import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Hoverable } from '@/components/Hoverable';
import { MenuBrowser } from '@/components/MenuBrowser';

const BRAND_PRIMARY = '#073F78';
const BRAND_ORANGE = '#FF6D00';
const BRAND_WHITE = '#FFFFFF';
const BG_DARK = '#F0F4FF';
const BG_SURFACE = '#FFFFFF';

interface MenuScreenProps {
  onShowDrawer: () => void;
  onOrderDetailsPress: () => void;
}

export function MenuScreen({ onShowDrawer, onOrderDetailsPress }: MenuScreenProps) {
  return (
    <View style={styles.tabContent}>
      <View style={styles.appHeader}>
        <View style={styles.headerLeft}>
          <Hoverable
            style={styles.headerIconBtn}
            onPress={onShowDrawer}
            hoverOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Open menu"
          >
            <MaterialIcons name="menu" size={24} color={BRAND_WHITE} />
          </Hoverable>

          <Text style={styles.headerTitleText}>Menu</Text>
        </View>

        <Hoverable
          style={styles.headerBadgeBtn}
          onPress={onOrderDetailsPress}
          hoverOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Open order details"
        >
          <MaterialIcons name="receipt-long" size={24} color={BRAND_WHITE} />
          <Text style={styles.headerBadgeText}>Order Details</Text>
        </Hoverable>
      </View>
      <View style={{ flex: 1, backgroundColor: BG_SURFACE }}>
        <MenuBrowser />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabContent: {
    flex: 1,
    backgroundColor: BG_DARK,
  },
  appHeader: {
    backgroundColor: BRAND_PRIMARY,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: 2,
    borderBottomColor: BRAND_ORANGE,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitleText: {
    marginLeft: 10,
    fontSize: 20,
    fontWeight: '800',
    color: BRAND_WHITE,
    letterSpacing: 0.1,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer', transition: 'all 0.15s ease' }),
  },
  headerBadgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: BRAND_ORANGE,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    ...(Platform.OS === 'web' && { cursor: 'pointer', transition: 'all 0.15s ease' }),
  },
  headerBadgeText: {
    color: BRAND_WHITE,
    fontSize: 16,
    fontWeight: '800',
  },
});
