'use client';

import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Hoverable } from '@/components/Hoverable';
import { COLORS } from './shared';

export interface DashboardKpi {
  icon: string;
  color: string;
  value: string;
  label: string;
  onPress?: () => void;
}

export function KpiGrid({ kpis }: { kpis: DashboardKpi[] }) {
  const rows: DashboardKpi[][] = [];
  for (let i = 0; i < kpis.length; i += 2) {
    rows.push(kpis.slice(i, i + 2));
  }

  return (
    <View>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((kpi) => (
            <Hoverable
              key={kpi.label}
              style={[styles.card, { borderLeftColor: kpi.color }]}
              onPress={kpi.onPress}
              hoverOpacity={0.8}
            >
              <MaterialCommunityIcons name={kpi.icon as any} size={19} color={kpi.color} />
              <Text
                style={[styles.value, { color: kpi.color }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {kpi.value}
              </Text>
              <Text style={styles.label}>{kpi.label}</Text>
            </Hoverable>
          ))}
          {row.length === 1 && <View style={[styles.card, styles.cardPlaceholder]} />}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  card: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 3,
    elevation: 2,
  },
  cardPlaceholder: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    elevation: 0,
  },
  value: {
    fontSize: 17,
    fontWeight: '900',
    marginTop: 4,
  },
  label: {
    fontSize: 10,
    color: COLORS.muted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
});
