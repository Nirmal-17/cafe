import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface TableTabIconProps {
  active: boolean;
  size?: number;
  color?: string;
}

export function TableTabIcon({ active, size = 24, color = '#6B7280' }: TableTabIconProps) {
  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);
  const lift = useSharedValue(0);

  useEffect(() => {
    if (active) {
      // Playful wiggle + hop while the My Tables tab is selected
      rotate.value = withRepeat(
        withSequence(
          withTiming(-12, { duration: 150, easing: Easing.inOut(Easing.quad) }),
          withTiming(12, { duration: 300, easing: Easing.inOut(Easing.quad) }),
          withTiming(-12, { duration: 300, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 150, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        false
      );
      lift.value = withRepeat(
        withSequence(
          withTiming(-4, { duration: 300, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) })
        ),
        -1,
        false
      );
      scale.value = withRepeat(
        withSequence(
          withTiming(1.18, { duration: 300, easing: Easing.out(Easing.back(1.8)) }),
          withTiming(1, { duration: 300, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        false
      );
    } else {
      // Gentle idle breathing so the table is always subtly animated
      scale.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        true
      );
      rotate.value = withTiming(0, { duration: 250 });
      lift.value = withTiming(0, { duration: 250 });
    }

    return () => {
      cancelAnimation(scale);
      cancelAnimation(rotate);
      cancelAnimation(lift);
    };
  }, [active, lift, rotate, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: lift.value },
      { rotate: `${rotate.value}deg` },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.View style={[styles.icon, animatedStyle]}>
      <MaterialCommunityIcons name="table-large" size={size} color={color} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  icon: { alignItems: 'center', justifyContent: 'center' },
});
