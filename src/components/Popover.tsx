'use client';

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Hoverable } from './Hoverable';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface PopoverItem {
  label: string;
  icon?: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface PopoverProps {
  visible: boolean;
  anchorRef: React.RefObject<View | null>;
  items: PopoverItem[];
  onClose: () => void;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
}

export function Popover({ visible, anchorRef, items, onClose, position: positionProp = 'auto' }: PopoverProps) {
  const [anchorLayout, setAnchorLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [popoverLayout, setPopoverLayout] = useState<{ width: number; height: number } | null>(null);
  const [fadeAnim] = useState(new Animated.Value(0));
  const popoverRef = useRef<View>(null);

  useEffect(() => {
    if (visible && anchorRef.current) {
      anchorRef.current.measure((x, y, width, height) => {
        setAnchorLayout({ x, y, width, height });
      });
    }
  }, [visible, anchorRef]);

  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, fadeAnim]);

  const calculatePosition = () => {
    if (!anchorLayout || !popoverLayout) return { top: 0, left: 0 };

    const anchorCenterX = anchorLayout.x + anchorLayout.width / 2;
    const anchorCenterY = anchorLayout.y + anchorLayout.height / 2;
    const popoverWidth = popoverLayout.width;
    const popoverHeight = popoverLayout.height;
    const GAP = 8;

    let top = 0;
    let left = 0;

    if (positionProp === 'bottom' || (positionProp === 'auto' && anchorCenterY < SCREEN_HEIGHT / 2)) {
      top = anchorLayout.y + anchorLayout.height + GAP;
      left = anchorCenterX - popoverWidth / 2;
    } else if (positionProp === 'top' || (positionProp === 'auto' && anchorCenterY >= SCREEN_HEIGHT / 2)) {
      top = anchorLayout.y - popoverHeight - GAP;
      left = anchorCenterX - popoverWidth / 2;
    } else if (positionProp === 'right') {
      top = anchorCenterY - popoverHeight / 2;
      left = anchorLayout.x + anchorLayout.width + GAP;
    } else {
      top = anchorCenterY - popoverHeight / 2;
      left = anchorLayout.x - popoverWidth - GAP;
    }

    const padding = 12;
    left = Math.max(padding, Math.min(left, SCREEN_WIDTH - popoverWidth - padding));
    top = Math.max(padding, Math.min(top, SCREEN_HEIGHT - popoverHeight - padding));

    return { top, left };
  };

  const computedPosition = calculatePosition();

  if (!visible || !anchorLayout) return null;

  return (
    <TouchableOpacity
      style={StyleSheet.absoluteFill}
      onPress={onClose}
      accessibilityElementsHidden={true}
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        ref={popoverRef}
        style={[
          styles.popover,
          { top: computedPosition.top, left: computedPosition.left, opacity: fadeAnim },
        ]}
        onLayout={({ nativeEvent: { layout } }) => setPopoverLayout({ width: layout.width, height: layout.height })}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {items.map((item, index) => (
          <Hoverable
            key={index}
            style={[
              styles.item,
              item.destructive && styles.itemDestructive,
              item.disabled && styles.itemDisabled,
              index === items.length - 1 && styles.itemLast,
            ]}
            onPress={() => { if (!item.disabled) { item.onPress(); onClose(); } }}
            disabled={item.disabled}
            hoverOpacity={0.7}
            activeOpacity={0.6}
          >
            <View style={styles.itemContent}>
              {item.icon && <MaterialIcons name={item.icon as any} size={20} color={item.destructive ? '#EF4444' : '#0F172A'} style={styles.itemIcon} />}
              <Text style={[
                styles.itemText,
                item.destructive && styles.itemTextDestructive,
                item.disabled && styles.itemTextDisabled,
              ]}>
                {item.label}
              </Text>
            </View>
          </Hoverable>
        ))}
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  popover: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minWidth: 160,
    maxWidth: 280,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    zIndex: 1000,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  itemLast: {
    borderBottomWidth: 0,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  itemIcon: {
    width: 24,
    height: 24,
  },
  itemText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  itemTextDestructive: {
    color: '#EF4444',
  },
  itemTextDisabled: {
    color: '#94A3B8',
  },
  itemDestructive: {
    backgroundColor: '#FEF2F2',
  },
  itemDisabled: {
    opacity: 0.5,
  },
});

export default Popover;