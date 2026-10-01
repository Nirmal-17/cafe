'use client';

import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { COLORS, SectionCard, formatMoney } from './shared';

export interface ShiftStats {
  orders: number;
  bills: number;
  revenue: number;
  avgTicket: number;
}

interface TodayServiceCardProps {
  title: string;
  stats: ShiftStats | null;
  loading: boolean;
}

export function TodayServiceCard({ title, stats, loading }: TodayServiceCardProps) {
  const metrics = stats
    ? [
        { value: String(stats.orders), label: 'Orders' },
        { value: String(stats.bills), label: 'Bills Closed' },
        { value: formatMoney(stats.revenue), label: 'Revenue' },
        { value: formatMoney(stats.avgTicket), label: 'Avg Ticket' },
      ]
    : [];

  return (
    <SectionCard icon="clipboard-check-outline" iconColor={COLORS.teal} title={title}>
      {loading && !stats && <Text style={styles.loadingText}>Crunching today&apos;s numbers…</Text>}
      {stats && (
        <View style={styles.row}>
          {metrics.map((metric) => (
            <View key={metric.label} style={styles.metric}>
              <Text
                style={styles.metricValue}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {metric.value}
              </Text>
              <Text style={styles.metricLabel}>{metric.label}</Text>
            </View>
          ))}
        </View>
      )}
      {!stats && !loading && <Text style={styles.loadingText}>No service data yet today</Text>}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  metric: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 2,
    borderRightWidth: 1,
    borderRightColor: '#F1F5F9',
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.text,
    textAlign: 'center',
  },
  metricLabel: {
    fontSize: 9,
    color: COLORS.muted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 3,
    textAlign: 'center',
  },
  loadingText: {
    fontSize: 13,
    color: COLORS.muted,
    fontWeight: '500',
    textAlign: 'center',
    paddingVertical: 6,
  },
});
