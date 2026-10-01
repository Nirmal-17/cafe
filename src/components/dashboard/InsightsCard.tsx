'use client';

import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DashboardData } from '@/services/api';
import { COLORS, SectionCard, compactNumber, formatMoney } from './shared';

interface InsightsCardProps {
  data: DashboardData | null;
  loading: boolean;
}

export function InsightsCard({ data, loading }: InsightsCardProps) {
  if (!data && !loading) return null;

  if (!data) {
    return (
      <SectionCard icon="chart-box-outline" iconColor={COLORS.purple} title="Cafe Insights">
        <Text style={styles.loadingText}>Loading insights…</Text>
      </SectionCard>
    );
  }

  const { summary, dailyRevenue, topSellingItems, tableUtilization } = data;
  const maxRevenue = Math.max(...dailyRevenue.map((d) => d.revenue), 1);
  const topItems = topSellingItems.slice(0, 5);
  const maxQty = Math.max(...topItems.map((i) => i.totalQuantity), 1);

  return (
    <SectionCard icon="chart-box-outline" iconColor={COLORS.purple} title="Cafe Insights">
      {/* Headline stats */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{summary.todayOrders}</Text>
          <Text style={styles.statLabel}>Orders Today</Text>
        </View>
        <View style={styles.statBox}>
          <Text
            style={styles.statValue}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {formatMoney(summary.todayRevenue)}
          </Text>
          <Text style={styles.statLabel}>Sales Today</Text>
        </View>
        <View style={styles.statBox}>
          <Text
            style={styles.statValue}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {formatMoney(summary.averageOrderValue)}
          </Text>
          <Text style={styles.statLabel}>Avg Order</Text>
        </View>
      </View>

      {/* 7-day revenue bars */}
      <Text style={styles.subHeader}>Last 7 Days Revenue</Text>
      <View style={styles.chart}>
        {dailyRevenue.map((day, index) => {
          const isToday = index === dailyRevenue.length - 1;
          const barHeight = Math.max(4, Math.round((day.revenue / maxRevenue) * 72));
          return (
            <View key={`${day.date}-${index}`} style={styles.barCol}>
              <Text style={styles.barValue} numberOfLines={1}>
                {day.revenue > 0 ? compactNumber(day.revenue) : ''}
              </Text>
              <View
                style={[
                  styles.bar,
                  {
                    height: barHeight,
                    backgroundColor: isToday ? COLORS.primary : '#9DBBE0',
                  },
                ]}
              />
              <Text style={[styles.barLabel, isToday && styles.barLabelToday]}>{day.date}</Text>
            </View>
          );
        })}
      </View>

      {/* Top selling items */}
      <Text style={styles.subHeader}>Top Sellers</Text>
      {topItems.length === 0 && <Text style={styles.loadingText}>No sales recorded yet</Text>}
      {topItems.map((item, index) => (
        <View key={`${item.name}-${index}`} style={styles.topItem}>
          <View style={styles.topItemRow}>
            <View style={[styles.rank, index === 0 && styles.rankFirst]}>
              <Text style={styles.rankText}>{index + 1}</Text>
            </View>
            <View style={styles.topItemInfo}>
              <Text style={styles.topItemName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.topItemCategory} numberOfLines={1}>
                {item.category}
              </Text>
            </View>
            <Text style={styles.topItemQty}>×{item.totalQuantity}</Text>
          </View>
          <View style={styles.track}>
            <View
              style={[
                styles.trackFill,
                {
                  width: `${Math.max(4, Math.round((item.totalQuantity / maxQty) * 100))}%`,
                  backgroundColor: index === 0 ? COLORS.orange : COLORS.cyan,
                },
              ]}
            />
          </View>
        </View>
      ))}

      {/* Table utilization */}
      <Text style={styles.subHeader}>Table Utilization</Text>
      <View style={styles.utilRow}>
        <MaterialCommunityIcons name="percent" size={16} color={COLORS.green} />
        <Text style={styles.utilValue}>{tableUtilization.utilizationRate}%</Text>
        <Text style={styles.utilSub}>
          {tableUtilization.occupied}/{tableUtilization.total} tables in use
        </Text>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.trackFill,
            {
              width: `${Math.max(2, tableUtilization.utilizationRate)}%`,
              backgroundColor: COLORS.green,
            },
          ]}
        />
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  loadingText: {
    fontSize: 13,
    color: COLORS.muted,
    fontWeight: '500',
    textAlign: 'center',
    paddingVertical: 6,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.text,
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 2,
  },
  subHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    height: 110,
    marginBottom: 16,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
  },
  barValue: {
    fontSize: 8,
    fontWeight: '800',
    color: COLORS.muted,
  },
  bar: {
    width: '70%',
    borderRadius: 4,
    minHeight: 4,
  },
  barLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.muted,
  },
  barLabelToday: {
    color: COLORS.primary,
    fontWeight: '900',
  },
  topItem: {
    marginBottom: 10,
  },
  topItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  rank: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankFirst: {
    backgroundColor: COLORS.orange,
  },
  rankText: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.white,
  },
  topItemInfo: {
    flex: 1,
  },
  topItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  topItemCategory: {
    fontSize: 10,
    color: COLORS.muted,
    fontWeight: '500',
  },
  topItemQty: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.primary,
  },
  track: {
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: 3,
  },
  utilRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  utilValue: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.text,
  },
  utilSub: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
});
