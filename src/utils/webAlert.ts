import { Alert, Platform } from 'react-native';
import { alertAsync } from '@/components/AlertDialog';

interface AlertButton {
  text: string;
  style?: 'cancel' | 'destructive' | 'default';
  onPress?: () => void;
}

export function webAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[]
): Promise<void> {
  const btns = buttons && buttons.length > 0
    ? buttons
    : [{ text: 'OK', style: 'cancel' as const }];

  if (Platform.OS === 'web') {
    return alertAsync(title, message || '', btns);
  }

  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      btns.map((b) => ({
        ...b,
        onPress: b.onPress
          ? () => { b.onPress!(); resolve(); }
          : () => resolve(),
      }))
    );
  });
}
