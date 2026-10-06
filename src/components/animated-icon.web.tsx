import { useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform, Image } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  runOnJS 
} from 'react-native-reanimated';

interface AnimatedSplashOverlayProps {
  onFinish?: () => void;
}

export function AnimatedSplashOverlay({ onFinish }: AnimatedSplashOverlayProps) {
  const opacity = useSharedValue(1);
  const scale = useSharedValue(0.96);

  useEffect(() => {
    // Subtle scale up entering animation
    scale.value = withTiming(1, { duration: 350 });

    // Brief hold, then fade out — total ~0.7s so the app appears almost
    // immediately instead of blocking on a 2.2s branded splash.
    const timer = setTimeout(() => {
      scale.value = withTiming(1.03, { duration: 250 });
      opacity.value = withTiming(0, { duration: 250 }, (finished) => {
        if (finished && onFinish) {
          runOnJS(onFinish)();
        }
      });
    }, 450);

    return () => clearTimeout(timer);
  }, [opacity, scale, onFinish]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [{ scale: scale.value }],
    };
  });

  const dismissSplash = () => {
    if (onFinish) {
      onFinish();
    }
  };

  return (
    <Animated.View style={[styles.splashOverlay, animatedStyle]}>
      <TouchableOpacity 
        activeOpacity={1} 
        onPress={dismissSplash}
        style={styles.container}
      >
        {/* Top spacer for optical centering */}
        <View style={styles.topSpacer} />

        {/* Center Section - Cafe Logo Image */}
        <View style={styles.centerSection}>
          <Image
            source={require('../../assets/images/cafelogo.jpg')}
            style={styles.centerLogoImage}
            resizeMode="contain"
          />
        </View>

        {/* Footer Section - Powered by Leading Edge Image */}
        <View style={styles.bottomFooter}>
          <Text style={styles.footerPrefixText}>POWERED BY</Text>
          <Image
            source={require('../../assets/images/leadinglogo.jpg')}
            style={styles.leadingLogoImage}
            resizeMode="contain"
          />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  splashOverlay: {
    ...(StyleSheet.absoluteFill as any),
    backgroundColor: '#ffffff',
    zIndex: 99999,
  },
  container: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  topSpacer: {
    height: 20,
  },
  centerSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  centerLogoImage: {
    width: 260,
    height: 94,
    maxWidth: '90%',
  },
  bottomFooter: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingBottom: 24,
  },
  footerPrefixText: {
    fontSize: 11,
    color: '#4b3f35',
    fontWeight: '800',
    letterSpacing: 1.8,
    marginBottom: 6,
    fontFamily: Platform.OS === 'web' ? 'Archivo, sans-serif' : undefined,
  },
  leadingLogoImage: {
    width: 270,
    height: 100,
    maxWidth: '85%',
  },
});


