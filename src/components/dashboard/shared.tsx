'use client';

import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export const COLORS = {
  primary: '#073F78',
  orange: '#FF6D00',
  yellow: '#FFD600',
  green: '#16A34A',
  red: '#D32F2F',
  purple: '#7C3AED',
  teal: '#0D9488',
  amber: '#F59E0B',
  cyan: '#06B6D4',
  pink: '#EC4899',

  background: '#F0F4FF',
  white: '#FFFFFF',
  border: '#CBD5E1',
  text: '#000000',
  muted: '#6B7280',
};

export const STATUS_COLORS: Record<string, string> = {
  PENDING: '#F59E0B',
  CONFIRMED: '#073F78',
  PREPARING: '#FF6D00',
  READY: '#16A34A',
  SERVED: '#0D9488',
  COMPLETED: '#073F78',
  CANCELLED: '#D32F2F',
};

export const TABLE_STATUS_COLORS: Record<string, string> = {
  OCCUPIED: '#7C3AED',
  PENDING_BILL: '#F59E0B',
  AVAILABLE: '#16A34A',
  RESERVED: '#7C3AED',
  CLEANING: '#6B7280',
};

export function formatMoney(value: number): string {
  return `Rs. ${Math.round(Number(value) || 0).toLocaleString()}`;
}

export function compactNumber(value: number): string {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1)}m`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

interface SectionCardProps {
  icon: string;
  iconColor: string;
  title: string;
  count?: number;
  countColor?: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}

export function SectionCard({
  icon,
  iconColor,
  title,
  count,
  countColor,
  actionLabel,
  onAction,
  children,
}: SectionCardProps) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIconWrap, { backgroundColor: iconColor + '18' }]}>
          <MaterialCommunityIcons name={icon as any} size={20} color={iconColor} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
        {typeof count === 'number' && count > 0 && (
          <View style={[styles.countBadge, { backgroundColor: countColor || iconColor }]}>
            <Text style={styles.countBadgeText}>{count > 99 ? '99+' : count}</Text>
          </View>
        )}
        {!!actionLabel && !!onAction && (
          <Text style={[styles.sectionAction, { color: iconColor }]} onPress={onAction}>
            {actionLabel}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  sectionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  countBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.white,
  },
  sectionAction: {
    fontSize: 13,
    fontWeight: '700',
  },
});
