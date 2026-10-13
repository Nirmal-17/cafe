import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Platform,
  SafeAreaView,
} from 'react-native';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import {
  getRelativeTime,
  StoredNotification,
} from '@/utils/notifications';
import { webAlert } from '@/utils/webAlert';
import { api } from '@/services/api';
import { switchMainTab } from '@/utils/mainTab';

// ─────────────────────────────────────────────
// Brand / semantic colors
// ─────────────────────────────────────────────

const BRAND_PRIMARY = '#073F78';
const BRAND_ORANGE = '#FF6D00';
const COLOR_SUCCESS = '#16A34A';
const COLOR_ERROR = '#D32F2F';
const COLOR_MUTED = '#6B7280';
const BG_LIGHT = '#F0F4FF';
const BG_WHITE = '#FFFFFF';
const BORDER_COLOR = '#CBD5E1';
const TEXT_DARK = '#000000';
const TEXT_MUTED = '#6B7280';

interface NotificationScreenProps {
  notifications: StoredNotification[];
  unreadCount: number;
  onRefresh: () => void | Promise<void>;
  onNavigateBack?: () => void;
}

export function NotificationScreen({ notifications, unreadCount, onRefresh, onNavigateBack }: NotificationScreenProps) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const runAction = useCallback(async (action: () => Promise<{ success: boolean; error?: string }>) => {
    const res = await action();
    if (!res.success) {
      await webAlert('Notification', res.error || 'Something went wrong — please try again.');
    }
    await onRefresh();
  }, [onRefresh]);

  const handleMarkAsRead = useCallback((id: string) => {
    return runAction(() => api.markNotificationRead(Number(id)));
  }, [runAction]);

  const handleMarkAllRead = useCallback(() => {
    return runAction(() => api.markAllNotificationsRead());
  }, [runAction]);

  const handleClear = useCallback((id: string) => {
    return runAction(() => api.clearNotification(Number(id)));
  }, [runAction]);

  const handleClearAll = useCallback(async () => {
    await webAlert(
      'Clear All Notifications',
      'This will remove all notifications from your list. Orders and bills are not affected. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await runAction(() => api.clearAllNotifications());
          },
        },
      ]
    );
  }, [runAction]);

  const handleNotificationPress = useCallback((item: StoredNotification) => {
    if (!item.read) {
      handleMarkAsRead(item.id);
    }
    // Bill-requested alert: OK lands on the Order Details list, where the
    // billed table is already removed.
    if (item.type === 'bill_requested' && item.tableId) {
      webAlert(item.title, item.message, [{
        text: 'OK',
        onPress: () => {
          switchMainTab('orders');
        },
      }]);
      return;
    }
    webAlert(item.title, item.message, [{ text: 'OK' }]);
  }, [handleMarkAsRead]);

  const getTypeIcon = (type: StoredNotification['type']) => {
    switch (type) {
      case 'order_ready':
        return 'silverware-fork-knife';
      case 'order_served':
        return 'check-decagram';
      case 'bill_requested':
        return 'cash-register';
      case 'order_created':
        return 'plus-circle';
      case 'order_paid':
        return 'cash-check';
      case 'table_status':
        return 'table-furniture';
      case 'order_assigned':
        return 'account-arrow-right';
      default:
        return 'bell-outline';
    }
  };

  const getTypeColor = (type: StoredNotification['type']) => {
    switch (type) {
      case 'order_ready':
        return COLOR_SUCCESS;
      case 'order_served':
        return BRAND_PRIMARY;
      case 'bill_requested':
        return BRAND_PRIMARY;
      case 'order_created':
        return BRAND_ORANGE;
      case 'order_paid':
        return COLOR_SUCCESS;
      case 'table_status':
        return BRAND_ORANGE;
      case 'order_assigned':
        return BRAND_PRIMARY;
      default:
        return COLOR_MUTED;
    }
  };

  const getTypeBg = (type: StoredNotification['type']) => {
    const color = getTypeColor(type);
    return color + '18';
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => onNavigateBack?.()}
          activeOpacity={0.7}
        >
          <MaterialIcons name="arrow-back" size={24} color={TEXT_DARK} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
        </View>
        <View style={styles.headerActions}>
          {unreadCount > 0 && (
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={handleMarkAllRead}
              activeOpacity={0.7}
            >
              <Text style={styles.headerActionText}>Mark All Read</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[BRAND_PRIMARY]} />
        }
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {notifications.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="bell-off" size={64} color={TEXT_MUTED} />
            <Text style={styles.emptyTitle}>No Notifications</Text>
            <Text style={styles.emptySubtitle}>{"You're all caught up!"}</Text>
          </View>
        ) : (
          notifications.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.notifCard, !item.read && styles.notifCardUnread]}
              onPress={() => handleNotificationPress(item)}
              activeOpacity={0.7}
            >
              {!item.read && <View style={styles.notifUnreadDot} />}
              <View style={[styles.notifIconCircle, { backgroundColor: getTypeBg(item.type) }]}>
                <MaterialCommunityIcons
                  name={getTypeIcon(item.type)}
                  size={20}
                  color={getTypeColor(item.type)}
                />
              </View>
              <View style={styles.notifContent}>
                <View style={styles.notifHeader}>
                  <Text style={styles.notifTitle}>{item.title}</Text>
                  <Text style={styles.notifTime}>{getRelativeTime(item.timestamp)}</Text>
                </View>
                <Text style={styles.notifMessage}>{item.message}</Text>
                {!!(item.tableNumber || item.tableId) && (
                  <Text style={styles.notifMeta}>
                    Table: {item.tableNumber || item.tableId}
                  </Text>
                )}
                {!!item.orderId && (
                  <Text style={styles.notifMeta}>
                    Order #{item.orderId} • {item.orderStatus || 'Active'}
                  </Text>
                )}
              </View>
              {!item.read && (
                <TouchableOpacity
                  style={styles.cardActionBtn}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleMarkAsRead(item.id);
                  }}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="done" size={18} color={COLOR_SUCCESS} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.cardActionBtn}
                onPress={(e) => {
                  e.stopPropagation();
                  handleClear(item.id);
                }}
                activeOpacity={0.7}
              >
                <MaterialIcons name="close" size={18} color={COLOR_ERROR} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {notifications.length > 0 && (
        <View style={styles.bottomActions}>
          {unreadCount > 0 && (
            <TouchableOpacity
              style={styles.bottomBtnPrimary}
              onPress={handleMarkAllRead}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="check-all" size={18} color={BG_WHITE} />
              <Text style={styles.bottomBtnText}>Mark All as Read</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.bottomBtnSecondary}
            onPress={handleClearAll}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="delete-sweep" size={18} color={COLOR_ERROR} />
            <Text style={[styles.bottomBtnText, { color: COLOR_ERROR }]}>Clear All</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG_LIGHT },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: BRAND_PRIMARY,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },
  backButton: { padding: 4 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.2 },
  headerBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLOR_ERROR,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  headerBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerActionBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  headerActionText: { fontSize: 12, color: '#FFFFFF', fontWeight: '600' },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100, gap: 8 },
  notifCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: BG_WHITE,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    alignItems: 'center',
  },
  notifCardUnread: { borderColor: BRAND_PRIMARY, borderWidth: 1, backgroundColor: '#EFF6FF' },
  notifUnreadDot: { position: 'absolute', top: 12, left: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: COLOR_ERROR },
  notifIconCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  notifContent: { flex: 1, justifyContent: 'center' },
  notifHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  notifTitle: { fontSize: 14, fontWeight: '700', color: TEXT_DARK },
  notifTime: { fontSize: 11, color: TEXT_MUTED },
  notifMessage: { fontSize: 12, color: TEXT_MUTED, marginBottom: 2 },
  notifMeta: { fontSize: 11, color: COLOR_MUTED, fontWeight: '500' },
  cardActionBtn: { padding: 4 },
  bottomActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: BG_LIGHT,
    borderTopWidth: 1,
    borderTopColor: BORDER_COLOR,
    paddingBottom: Platform.OS === 'ios' ? 30 : 12,
  },
  bottomBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 12,
    backgroundColor: BRAND_PRIMARY,
  },
  bottomBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 12,
    backgroundColor: BG_WHITE,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
  },
  bottomBtnText: { fontSize: 14, fontWeight: '700', color: BG_WHITE },
  emptyState: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32, paddingVertical: 64 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: TEXT_DARK },
  emptySubtitle: { fontSize: 14, color: TEXT_MUTED },
});
