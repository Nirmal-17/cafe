import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Hoverable } from '@/components/Hoverable';
import { api, StaffUser } from '@/services/api';
import { getStorageItemSync, setStorageItemSync, removeStorageItemSync } from '@/utils/storage';

const COLORS = {
  panel: '#3F3D77',
  panelDark: '#2B2A5E',
  teal: '#3FC1A4',
  inputBg: '#E9EFFC',
  inputText: '#1E1E3F',
  green: '#2FA32F',
  red: '#D81E45',
  navy: '#1B3A8C',
  white: '#FFFFFF',
  muted: '#6B7280',
  errorBg: '#FEE2E2',
  errorBorder: '#FECACA',
  error: '#D32F2F',
};

interface LoginScreenProps {
  onLoginSuccess: (user: StaffUser) => void;
}

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [username, setUsername] = useState(() => getStorageItemSync('smart_cafe_saved_username') || '');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [notice, setNotice] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [serverOffline, setServerOffline] = useState(false);
  const [showServerUrl, setShowServerUrl] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState(() => api.getBaseUrl());
  const logoTapCountRef = useRef(0);
  const lastLogoTapRef = useRef(0);

  const checkServer = async () => {
    const res = await api.pingHealth();
    setServerOffline(res === null);
  };

  useEffect(() => {
    let cancelled = false;
    api.pingHealth().then((res) => {
      if (!cancelled) setServerOffline(res === null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Hidden dev menu: triple-tap the brand logo to reveal the server URL box.
  // Counted on press-*start* (onPressIn) rather than onPress: on web the click
  // behind onPress is dropped whenever a text selection or image drag cancels
  // it, which is exactly what happens on the 2nd/3rd tap of a triple-tap.
  const handleLogoTap = () => {
    const now = Date.now();
    if (now - lastLogoTapRef.current > 2500) {
      logoTapCountRef.current = 0;
    }
    lastLogoTapRef.current = now;
    logoTapCountRef.current += 1;
    if (logoTapCountRef.current >= 3) {
      logoTapCountRef.current = 0;
      setServerUrlInput(api.getBaseUrl());
      setShowServerUrl((visible) => !visible);
    }
  };

  const handleSaveServerUrl = () => {
    const saved = api.setBaseUrl(serverUrlInput);
    setServerUrlInput(saved);
    setShowServerUrl(false);
    checkServer();
  };

  const { width, height } = useWindowDimensions();
  const isWide = width >= 900;

  // Stacked (narrow) layout: brand photo on top, login form below — each half
  // gets ~50% of the screen, so scale content down until both halves fit.
  const scale = isWide ? 1 : Math.min(1, Math.max(0.5, height / 1010));
  const s = (n: number) => Math.round(n * scale);

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      setAuthError('Please enter username and password');
      return;
    }
    setAuthLoading(true);
    setAuthError('');
    setNotice('');
    try {
      const response = await api.login(username.trim(), password);
      if (response.success && response.data) {
        const { user: loggedUser, token } = response.data;
        api.setToken(token);
        setStorageItemSync('smart_cafe_token', token);
        setStorageItemSync('smart_cafe_user', JSON.stringify(loggedUser));
        if (rememberMe) {
          setStorageItemSync('smart_cafe_saved_username', username.trim());
        } else {
          removeStorageItemSync('smart_cafe_saved_username');
        }
        onLoginSuccess(loggedUser);
      } else {
        setAuthError(response.error || 'Username and Password did not match');
      }
    } catch (_err) {
      setAuthError(`Cannot reach server at ${api.getBaseUrl()} — check connection or server URL.`);
    } finally {
      setAuthLoading(false);
    }
  };

  const formPanel = (
    <View
      style={[
        styles.formPanel,
        {
          paddingHorizontal: s(48),
          paddingVertical: isWide ? 48 : s(20),
        },
        !isWide && styles.formPanelStacked,
      ]}
    >
      <Text style={[styles.formTitle, { fontSize: s(30), marginBottom: s(14) }]}>Login Here</Text>
      <Text style={[styles.formSubtitle, { fontSize: s(15), marginBottom: s(24) }]}>
        Please provide your login credentials.
      </Text>

      {serverOffline ? (
        <View
          style={[
            styles.errorBox,
            { padding: s(12), marginBottom: s(14), backgroundColor: '#FEF3C7', borderColor: '#FCD34D' },
          ]}
        >
          <MaterialCommunityIcons name="cloud-off-outline" size={s(18)} color="#B45309" />
          <Text style={[styles.errorText, { color: '#B45309' }]}>
            Backend offline — demo login: waiter@leadingedge.com / Wait3rCafe123
          </Text>
        </View>
      ) : null}

      {authError ? (
        <View style={[styles.errorBox, { padding: s(12), marginBottom: s(14) }]}>
          <MaterialCommunityIcons name="alert-circle" size={s(18)} color={COLORS.error} />
          <Text style={[styles.errorText, { fontSize: s(13) }]}>{authError}</Text>
        </View>
      ) : null}

      <View style={[styles.inputRow, { height: s(52), marginBottom: s(16) }]}>
        <View style={[styles.inputIconBox, { width: s(52), height: s(52) }]}>
          <MaterialIcons name="person" size={s(20)} color={COLORS.white} />
        </View>
        <TextInput
          style={[styles.input, { height: s(52), fontSize: s(16), paddingHorizontal: s(16) }]}
          placeholder="Username"
          placeholderTextColor="#8A8AB0"
          value={username}
          onChangeText={(text) => {
            setUsername(text);
            setAuthError('');
          }}
          autoCapitalize="none"
          editable={!authLoading}
        />
      </View>

      <View style={[styles.inputRow, { height: s(52), marginBottom: s(16) }]}>
        <View style={[styles.inputIconBox, { width: s(52), height: s(52) }]}>
          <MaterialIcons name="lock" size={s(20)} color={COLORS.white} />
        </View>
        <TextInput
          style={[styles.input, { height: s(52), fontSize: s(16), paddingHorizontal: s(16) }]}
          placeholder="Password"
          placeholderTextColor="#8A8AB0"
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            setAuthError('');
          }}
          secureTextEntry={!showPassword}
          editable={!authLoading}
        />
      </View>

      <View style={[styles.optionRow, { marginBottom: s(10) }]}>
        <Hoverable style={styles.checkboxTouch} onPress={() => setShowPassword(!showPassword)} hoverOpacity={0.7}>
          <MaterialCommunityIcons
            name={showPassword ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={s(20)}
            color={COLORS.white}
          />
          <Text style={[styles.optionLabel, { fontSize: s(15) }]}>Show Password</Text>
        </Hoverable>
      </View>

      <View style={[styles.optionRow, styles.optionRowSpread, { marginBottom: s(8) }]}>
        <Hoverable style={styles.checkboxTouch} onPress={() => setRememberMe(!rememberMe)} hoverOpacity={0.7}>
          <MaterialCommunityIcons
            name={rememberMe ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={s(20)}
            color={COLORS.white}
          />
          <Text style={[styles.optionLabel, { fontSize: s(15) }]}>Remember me</Text>
        </Hoverable>
        <Hoverable
          style={styles.forgotTouch}
          onPress={() => {
            setAuthError('');
            setNotice('Please contact your administrator to reset your password.');
          }}
          hoverOpacity={0.7}
        >
          <Text style={[styles.forgotText, { fontSize: s(13) }]}>FORGOT PASSWORD...?</Text>
        </Hoverable>
      </View>

      {notice ? <Text style={[styles.noticeText, { fontSize: s(13), marginBottom: s(6) }]}>{notice}</Text> : null}

      <Hoverable
        style={[styles.loginButton, { height: s(54), marginTop: s(18) }, authLoading && { opacity: 0.8 }]}
        onPress={handleLogin}
        disabled={authLoading}
        hoverOpacity={0.8}
      >
        {authLoading ? (
          <ActivityIndicator size="small" color={COLORS.white} />
        ) : (
          <Text style={[styles.loginButtonText, { fontSize: s(17) }]}>LOGIN</Text>
        )}
      </Hoverable>

      <View style={[styles.contactRow, { marginTop: isWide ? 40 : s(24) }]}>
        <Text style={[styles.contactText, { fontSize: s(15) }]}>{"Don't Have an account..? "}</Text>
        <Hoverable
          onPress={() => {
            setAuthError('');
            setNotice('Contact us at support@leadingedgesoftware.com');
          }}
          hoverOpacity={0.7}
        >
          <Text style={[styles.contactLink, { fontSize: s(15) }]}>Contact Us</Text>
        </Hoverable>
      </View>
    </View>
  );

  const brandPanel = (
    <View
      style={[
        styles.brandPanel,
        {
          paddingHorizontal: s(40),
          paddingVertical: isWide ? 48 : s(16),
        },
        !isWide && styles.brandPanelStacked,
      ]}
    >
      <Text style={[styles.brandTitle, { fontSize: s(32), lineHeight: s(42) }]}>
        <Text style={{ color: COLORS.red }}>Restaurant</Text>
        {'\n'}
        <Text style={{ color: COLORS.navy }}>Management</Text> <Text style={{ color: COLORS.red }}>System</Text>
      </Text>
      <Text style={[styles.brandSubtitle, { fontSize: s(15), marginTop: s(10), lineHeight: s(22) }]}>
        Simplify operations, enhance customer experiences,{'\n'}and boost efficiency.
      </Text>

      <Hoverable
        style={[styles.logoTouch, { width: s(170), height: s(170), marginTop: s(16) }]}
        onPressIn={handleLogoTap}
        delayPressIn={0}
        hoverOpacity={1}
        hoverStyle={{ opacity: 1 }}
        accessibilityRole="image"
        accessibilityLabel="Cafe logo"
      >
        <Image
          source={require('../../../assets/images/loginlogo.jpg')}
          style={{ width: '100%', height: '100%' }}
          resizeMode="contain"
        />
      </Hoverable>

      {showServerUrl ? (
        <View style={[styles.serverUrlBox, { marginTop: s(12), padding: s(12), borderRadius: s(8), width: Math.min(s(340), width - 48) }]}>
          <Text style={[styles.serverUrlLabel, { fontSize: s(12) }]}>SERVER URL</Text>
          <TextInput
            style={[styles.serverUrlInput, { height: s(40), fontSize: s(14), paddingHorizontal: s(10) }]}
            value={serverUrlInput}
            onChangeText={setServerUrlInput}
            placeholder="http://192.168.1.10:3000"
            placeholderTextColor="#8A8AB0"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <View style={styles.serverUrlActions}>
            <Hoverable
              style={[styles.serverUrlBtn, styles.serverUrlBtnSecondary, { height: s(36) }]}
              onPress={() => {
                setServerUrlInput(api.resetBaseUrl());
                setShowServerUrl(false);
                checkServer();
              }}
              hoverOpacity={0.8}
            >
              <Text style={[styles.serverUrlBtnText, { fontSize: s(13) }]}>Reset</Text>
            </Hoverable>
            <Hoverable
              style={[styles.serverUrlBtn, styles.serverUrlBtnPrimary, { height: s(36) }]}
              onPress={handleSaveServerUrl}
              hoverOpacity={0.8}
            >
              <Text style={[styles.serverUrlBtnText, { fontSize: s(13), color: COLORS.white }]}>Save</Text>
            </Hoverable>
          </View>
        </View>
      ) : null}
      <Hoverable
        style={[styles.logoTouch, { width: Math.min(s(320), width - 48), height: s(110), marginTop: s(12) }]}
        onPressIn={handleLogoTap}
        delayPressIn={0}
        hoverOpacity={1}
        hoverStyle={{ opacity: 1 }}
        accessibilityRole="image"
        accessibilityLabel="Company logo"
      >
        <Image
          source={require('../../../assets/images/leadingedge.jpg')}
          style={{ width: '100%', height: '100%' }}
          resizeMode="contain"
        />
      </Hoverable>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.split, isWide && styles.splitWide]}>
            {isWide ? formPanel : null}
            {brandPanel}
            {isWide ? null : formPanel}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },

  scrollContent: {
    flexGrow: 1,
  },

  split: {
    flexGrow: 1,
  },

  splitWide: {
    flexDirection: 'row',
  },

  formPanel: {
    backgroundColor: COLORS.panel,
    justifyContent: 'center',
    flex: 1,
  },

  formPanelStacked: {
    paddingTop: 12,
    paddingBottom: 16,
  },

  formTitle: {
    color: COLORS.teal,
    fontWeight: '700',
    textAlign: 'center',
  },

  formSubtitle: {
    color: '#C9C8E0',
    textAlign: 'center',
  },

  errorBox: {
    backgroundColor: COLORS.errorBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.errorBorder,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  errorText: {
    color: COLORS.error,
    fontWeight: '600',
    flex: 1,
  },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  inputIconBox: {
    backgroundColor: COLORS.panelDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.white,
    borderRightWidth: 0,
  },

  input: {
    flex: 1,
    backgroundColor: COLORS.inputBg,
    color: COLORS.inputText,
    borderWidth: 1,
    borderColor: COLORS.white,
    ...(Platform.OS === 'web' && { outlineStyle: 'none' } as object),
  },

  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  optionRowSpread: {
    justifyContent: 'space-between',
  },

  checkboxTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  optionLabel: {
    color: COLORS.white,
    fontWeight: '600',
  },

  forgotTouch: {
    paddingVertical: 4,
    paddingLeft: 12,
  },

  forgotText: {
    color: COLORS.white,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  noticeText: {
    color: '#C9C8E0',
    textAlign: 'center',
  },

  loginButton: {
    backgroundColor: COLORS.green,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer', transition: 'all 0.15s ease' }),
  },

  loginButtonText: {
    color: COLORS.white,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  contactRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
  },

  contactText: {
    color: COLORS.white,
    fontWeight: '500',
  },

  contactLink: {
    color: COLORS.teal,
    fontWeight: '700',
  },

  brandPanel: {
    backgroundColor: COLORS.white,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  brandPanelStacked: {
    paddingTop: 20,
    paddingBottom: 8,
    borderBottomWidth: 4,
    borderBottomColor: '#E5E7EB',
  },

  brandTitle: {
    fontWeight: '800',
    textAlign: 'center',
    color: COLORS.red,
  },

  brandSubtitle: {
    color: COLORS.muted,
    textAlign: 'center',
  },

  logoTouch: {
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
  },

  serverUrlBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignSelf: 'center',
  },

  serverUrlLabel: {
    color: COLORS.muted,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 6,
  },

  serverUrlInput: {
    backgroundColor: COLORS.white,
    color: COLORS.inputText,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    ...(Platform.OS === 'web' && { outlineStyle: 'none' } as object),
  },

  serverUrlActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },

  serverUrlBtn: {
    flex: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },

  serverUrlBtnPrimary: {
    backgroundColor: COLORS.green,
  },

  serverUrlBtnSecondary: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },

  serverUrlBtnText: {
    fontWeight: '700',
    color: COLORS.inputText,
  },
});
