import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export interface AlertDialogButton {
  text: string;
  style?: 'cancel' | 'destructive' | 'default';
  onPress?: () => void;
}

interface AlertDialogState {
  visible: boolean;
  title: string;
  message: string;
  buttons: AlertDialogButton[];
}

let _setDialog: ((state: AlertDialogState) => void) | null = null;

export function alertAsync(
  title: string,
  message: string,
  buttons: AlertDialogButton[]
): Promise<void> {
  return new Promise((resolve) => {
    if (_setDialog) {
      _setDialog({
        visible: true,
        title,
        message,
        buttons: buttons.map((b) => ({
          ...b,
          onPress: b.onPress
            ? () => {
                b.onPress!();
                resolve();
              }
            : () => resolve(),
        })),
      });
    } else {
      resolve();
    }
  });
}

export function AlertDialog() {
  const [state, setState] = useState<AlertDialogState>({
    visible: false,
    title: '',
    message: '',
    buttons: [],
  });

  useEffect(() => {
    _setDialog = setState;
    return () => {
      if (_setDialog === setState) {
        _setDialog = null;
      }
    };
  }, []);

  const handleButtonPress = (button: AlertDialogButton) => {
    setState((prev) => ({ ...prev, visible: false }));
    setTimeout(() => button.onPress?.(), 100);
  };

  return (
    <Modal
      visible={state.visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        const cancelBtn = state.buttons.find((b) => b.style === 'cancel');
        if (cancelBtn) handleButtonPress(cancelBtn);
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text style={styles.title}>{state.title}</Text>
          <Text style={styles.message}>{state.message}</Text>
          <View style={styles.buttonRow}>
            {state.buttons.map((button, index) => {
              const isDestructive = button.style === 'destructive';
              const isCancel = button.style === 'cancel';
              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.button,
                    isDestructive && styles.destructiveButton,
                    isCancel && styles.cancelButton,
                    state.buttons.length === 1 && styles.singleButton,
                  ]}
                  onPress={() => handleButtonPress(button)}
                  activeOpacity={0.7}
                >
                  {isDestructive && (
                    <MaterialIcons name="warning" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                  )}
                  <Text
                    style={[
                      styles.buttonText,
                      isDestructive && styles.destructiveButtonText,
                      isCancel && styles.cancelButtonText,
                    ]}
                  >
                    {button.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    minWidth: 80,
  },
  singleButton: {
    flex: 1,
  },
  destructiveButton: {
    backgroundColor: '#DC2626',
  },
  cancelButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  destructiveButtonText: {
    color: '#FFFFFF',
  },
  cancelButtonText: {
    color: '#64748B',
  },
});
