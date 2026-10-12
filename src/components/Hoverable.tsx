import React, { useState, useCallback, forwardRef } from 'react';
import { TouchableOpacity, Platform, ViewStyle, StyleProp, TouchableOpacityProps } from 'react-native';

type AnyStyle = StyleProp<ViewStyle>;

interface HoverableProps extends Omit<TouchableOpacityProps, 'onPress' | 'style' | 'disabled' | 'activeOpacity' | 'accessibilityRole' | 'accessibilityLabel' | 'accessibilityState' | 'accessible' | 'id'> {
  children: React.ReactNode;
  onPress?: () => void;
  style?: AnyStyle | AnyStyle[];
  hoverStyle?: ViewStyle;
  hoverOpacity?: number;
  disabled?: boolean;
  activeOpacity?: number;
  accessibilityRole?: 'button' | 'link' | 'none' | 'image' | 'header' | 'search' | 'text' | 'summary';
  accessibilityLabel?: string;
  accessibilityState?: Record<string, any>;
  accessible?: boolean;
  id?: string;
  onHoverIn?: (e?: any) => void;
  onHoverOut?: (e?: any) => void;
}

export const Hoverable = forwardRef<React.ElementRef<typeof TouchableOpacity>, HoverableProps>(
  ({
    children,
    onPress,
    style,
    hoverStyle,
    hoverOpacity = 0.75,
    disabled = false,
    activeOpacity = 0.85,
    accessibilityRole = 'button',
    accessibilityLabel,
    accessibilityState,
    accessible,
    id,
    onHoverIn: externalHoverIn,
    onHoverOut: externalHoverOut,
    ...rest
  }, ref) => {
    const [hovered, setHovered] = useState(false);

    const onHoverIn = useCallback(
      (e?: any) => {
        setHovered(true);
        (externalHoverIn as any)?.(e);
      },
      [externalHoverIn]
    );
    const onHoverOut = useCallback(
      (e?: any) => {
        setHovered(false);
        (externalHoverOut as any)?.(e);
      },
      [externalHoverOut]
    );

    const webStyle = Platform.OS === 'web' && hovered
      ? (hoverStyle ?? { opacity: hoverOpacity })
      : undefined;

    return (
      <TouchableOpacity
        ref={ref}
        onPress={onPress}
        style={[style, webStyle] as AnyStyle[]}
        disabled={disabled}
        activeOpacity={activeOpacity}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityState={accessibilityState}
        accessible={accessible}
        id={id}
        {...(Platform.OS === 'web' && { onHoverIn, onHoverOut })}
        {...rest}
      >
        {children}
      </TouchableOpacity>
    );
  }
);

Hoverable.displayName = 'Hoverable';
