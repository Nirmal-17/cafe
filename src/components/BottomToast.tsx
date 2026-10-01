import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  useResponsive,
  getSpacing,
  getFontSize,
  getTabBarHeight,
} from '@/utils/responsive';

export type BottomToastTone = 'success' | 'info' | 'warning' | 'error';

export interface BottomToastPayload {
  title: string;
  message?: string;
  tone?: BottomToastTone;
  durationMs?: number;
}

interface ToastItem extends BottomToastPayload {
  key: number;
}

let _setToast: ((toast: ToastItem | null) => void) | null = null;

const DEFAULT_DURATION_MS = 4500;

const TONE_META: Record<BottomToastTone, { accent: string; icon: 'check-circle' | 'information' | 'alert' | 'alert-circle' }> = {
  success: { accent: '#16A34A', icon: 'check-circle' },
  info: { accent: '#073F78', icon: 'information' },
  warning: { accent: '#F97316', icon: 'alert' },
  error: { accent: '#D32F2F', icon: 'alert-circle' },
};

export function showBottomToast(payload: BottomToastPayload): void {
  _setToast?.({ ...payload, key: Date.now() });
}

export function BottomToast() {
  const { breakpoint, isDesktop } = useResponsive();
  const [toast, setToast] = useState<ToastItem | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    _setToast = setToast;
    return () => {
      if (_setToast === setToast) {
        _setToast = null;
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setToast(null);
    }, toast.durationMs ?? DEFAULT_DURATION_MS);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [toast]);

  const tone = TONE_META[toast?.tone ?? 'success'];
  const bottomOffset = getTabBarHeight(breakpoint) + getSpacing(breakpoint, 'sm') * 2;

  return (
    <View pointerEvents="box-none" style={[styles.host, { paddingBottom: bottomOffset }]}>
      {toast && (
        <Animated.View
          key={toast.key}
          entering={FadeInDown.duration(280)}
          exiting={FadeOutDown.duration(200)}
          style={isDesktop ? styles.cardDesktop : undefined}
        >
          <TouchableOpacity
            style={[styles.card, { borderLeftColor: tone.accent }]}
            activeOpacity={0.9}
            onPress={() => setToast(null)}
            accessibilityRole="alert"
            accessibilityLabel={`${toast.title}. ${toast.message ?? ''}`}
          >
            <View style={[styles.iconCircle, { backgroundColor: `${tone.accent}1F` }]}>
              <MaterialCommunityIcons name={tone.icon} size={22} color={tone.accent} />
            </View>
            <View style={styles.textCol}>
              <Text style={styles.title} numberOfLines={1}>
                {toast.title}
              </Text>
              {!!toast.message && (
                <Text style={styles.message} numberOfLines={2}>
                  {toast.message}
                </Text>
              )}
            </View>
            <MaterialCommunityIcons name="close" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    justifyContent: 'flex-end',
    zIndex: 999,
  },
  cardDesktop: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderLeftWidth: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 10,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
  },
  title: {
    fontSize: getFontSize('md', 'md'),
    fontWeight: '800',
    color: '#0F172A',
  },
  message: {
    fontSize: getFontSize('md', 'sm'),
    color: '#475569',
    marginTop: 2,
    lineHeight: 18,
  },
});
