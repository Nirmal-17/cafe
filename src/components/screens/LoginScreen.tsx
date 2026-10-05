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
import { loadSession, saveSession, savedUsername } from '@/utils/sessions';
import { describeLoopbackIssue } from '@/config/apiConfig';

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
  const [username, setUsername] = useState(() => savedUsername(api.getBaseUrl()));
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [notice, setNotice] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [serverOffline, setServerOffline] = useState(false);
  // Result of the last failed probe: the URL it targeted plus the opposite
  // scheme that answered (https:// typed against a plain-HTTP backend, or the
  // reverse). Offered only while it still matches the URL in the field.
  const [schemeProbe, setSchemeProbe] = useState<{ url: string; alternate: string } | null>(null);
  const [serverUrlInput, setServerUrlInput] = useState(() => api.getBaseUrl());
  // The SERVER URL card is a hidden admin control: it only appears after the
  // brand logo is triple-tapped (toggle back with another triple-tap).
  const [showServerUrl, setShowServerUrl] = useState(false);
  const logoTapTimesRef = useRef<number[]>([]);
  // Once the user types a username, switching servers must not overwrite it.
  const usernameTouchedRef = useRef(false);

  const handleLogoTripleTap = () => {
    const now = Date.now();
    const recent = logoTapTimesRef.current.filter((t) => now - t < 700);
    recent.push(now);
    logoTapTimesRef.current = recent;
    if (recent.length >= 3) {
      logoTapTimesRef.current = [];
      setShowServerUrl((v) => !v);
    }
  };

  // On a phone/emulator "localhost" is the device itself — the backend runs on
  // the computer, so spell out the reachable address instead of a bare
  // "server unreachable". Null on web and whenever the URL is not loopback.
  // Normalized first: a bare "localhost:3000" has no scheme, and the loopback
  // check only matches scheme-qualified URLs.
  const normalizedServerUrl = (() => {
    const check = api.validateBaseUrl(serverUrlInput);
    return check.ok ? check.url : api.normalizeUrl(serverUrlInput);
  })();
  const loopbackHint = describeLoopbackIssue(normalizedServerUrl);

  // Derived instead of cleared in an effect: a "switch to X" hint belongs to
  // the URL it was probed for and disappears the moment the field moves on.
  const probeTarget = api.validateBaseUrl(serverUrlInput.trim());
  const schemeSuggestion =
    probeTarget.ok && schemeProbe && schemeProbe.url === probeTarget.url ? schemeProbe.alternate : null;

  const handleSaveServerUrl = () => {
    const check = api.validateBaseUrl(serverUrlInput);
    if (!check.ok) {
      setNotice('');
      setAuthError(check.error || 'Invalid server URL');
      return;
    }
    const saved = api.setBaseUrl(serverUrlInput);
    setServerUrlInput(saved);
    if (!usernameTouchedRef.current) setUsername(savedUsername(saved));
    setAuthError('');
    setNotice(`Server URL saved — ${saved}`);
  };

  const handleResetServerUrl = () => {
    const url = api.resetBaseUrl();
    setServerUrlInput(url);
    if (!usernameTouchedRef.current) setUsername(savedUsername(url));
    setAuthError('');
    setNotice(`Server URL reset — ${url}`);
  };

  // Adopt the alternate-scheme URL the probe proved reachable.
  const handleUseSuggestedUrl = () => {
    if (!schemeSuggestion) return;
    const saved = api.setBaseUrl(schemeSuggestion);
    setServerUrlInput(saved);
    // The probe already got a healthy /health from exactly this URL, so drop
    // the offline banner now instead of letting it linger until the re-probe.
    setServerOffline(false);
    if (!usernameTouchedRef.current) setUsername(savedUsername(saved));
    setAuthError('');
    setNotice(`Server URL saved — ${saved}`);
  };

  // Reachability probe for the URL being typed (debounced).
  useEffect(() => {
    const raw = serverUrlInput.trim();
    if (!raw) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      // Malformed URLs can't be probed — the Save/Login error explains why.
      const check = api.validateBaseUrl(raw);
      if (!check.ok) {
        if (!cancelled) setServerOffline(false);
        return;
      }
      api.pingHealth(check.url).then(async (res) => {
        if (cancelled) return;
        setServerOffline(res === null);
        if (res !== null) {
          setSchemeProbe(null);
          return;
        }
        // Wrong scheme makes a live server look switched off (a plain-HTTP
        // backend never completes a TLS handshake). Only once the primary
        // probe failed do we try the other scheme, so a healthy server is
        // never probed twice.
        const alternate = await api.detectSchemeMismatch(check.url);
        if (cancelled) return;
        setSchemeProbe(alternate ? { url: check.url, alternate } : null);
      });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [serverUrlInput]);

  const handleLogin = async () => {
    if (!serverUrlInput.trim()) {
      setAuthError('Please enter the server URL');
      return;
    }
    const urlCheck = api.validateBaseUrl(serverUrlInput);
    if (!urlCheck.ok) {
      setAuthError(urlCheck.error || 'Invalid server URL');
      return;
    }
    if (!username.trim() || !password) {
      setAuthError('Please enter username and password');
      return;
    }
    setAuthLoading(true);
    setAuthError('');
    setNotice('');
    try {
      // Apply the typed URL first — credentials are always checked by that server.
      // It may be rewritten on a device (localhost -> the computer's LAN IP), so
      // show the URL that is actually being used.
      setServerUrlInput(api.setBaseUrl(serverUrlInput));
      api.setToken(null);
      const response = await api.login(username.trim(), password);
      if (response.success && response.data) {
        const { user: loggedUser, token } = response.data;
        // Existing auth mechanism: token + per-URL session are already stored by
        // api.login(); make sure the in-memory token is set before we leave.
        api.setToken(token);
        if (!rememberMe) {
          const session = loadSession(api.getBaseUrl());
          if (session) {
            saveSession(api.getBaseUrl(), { ...session, username: '' });
          }
        }
        onLoginSuccess(loggedUser);
      } else {
        setServerOffline(response.status === 0);
        // Only a network failure is a loopback problem — a rejected password
        // must never be masked by the "use your computer's IP" advice.
        setAuthError(
          (response.status === 0 && loopbackHint) ||
            response.error ||
            'Username and Password did not match'
        );
      }
    } catch (_err) {
      setAuthError(
        loopbackHint ||
          `Cannot reach server at ${api.getBaseUrl()} — check connection or server URL.`
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const { width, height } = useWindowDimensions();
  const isWide = width >= 900;

  // Stacked (narrow) layout: brand photo on top, login form below — each half
  // gets ~50% of the screen, so scale content down until both halves fit.
  const scale = isWide ? 1 : Math.min(1, Math.max(0.5, height / 1010));
  const s = (n: number) => Math.round(n * scale);

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

      {loopbackHint ? (
        <View
          style={[
            styles.errorBox,
            { padding: s(12), marginBottom: s(14), backgroundColor: '#FEF3C7', borderColor: '#FCD34D' },
          ]}
        >
          <MaterialCommunityIcons name="wifi-off" size={s(18)} color="#B45309" />
          <Text style={[styles.errorText, { color: '#B45309' }]}>{loopbackHint}</Text>
        </View>
      ) : null}

      {serverOffline ? (
        <Hoverable
          style={[
            styles.errorBox,
            { padding: s(12), marginBottom: s(14), backgroundColor: '#FEF3C7', borderColor: '#FCD34D' },
          ]}
          onPress={schemeSuggestion ? handleUseSuggestedUrl : undefined}
          disabled={!schemeSuggestion}
          hoverOpacity={0.85}
        >
          <MaterialCommunityIcons
            name={schemeSuggestion ? 'swap-horizontal' : 'cloud-off-outline'}
            size={s(18)}
            color="#B45309"
          />
          <Text style={[styles.errorText, { color: '#B45309' }]}>
            {schemeSuggestion
              ? `${serverUrlInput.trim() || api.getBaseUrl()} isn't answering — ${schemeSuggestion} is. Tap here to switch.`
              : `Cannot reach ${serverUrlInput.trim() || api.getBaseUrl()} — check the server URL or start the backend.`}
          </Text>
        </Hoverable>
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
            usernameTouchedRef.current = true;
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
        onPress={handleLogoTripleTap}
        hoverOpacity={0.85}
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
        <View style={[styles.serverUrlCard, { width: Math.min(s(340), width - 48), padding: s(16), marginTop: s(18) }]}>
          <Text style={[styles.serverUrlLabel, { fontSize: s(12), marginBottom: s(8) }]}>SERVER URL</Text>
          <TextInput
            style={[styles.serverUrlInput, { height: s(44), fontSize: s(14), paddingHorizontal: s(12) }]}
            placeholder="http://localhost:3000"
            placeholderTextColor="#9CA3AF"
            value={serverUrlInput}
            onChangeText={(text) => {
              setServerUrlInput(text);
              setAuthError('');
              // Each server URL remembers its own username — swap the pre-fill
              // while the user hasn't started typing one by hand.
              if (!usernameTouchedRef.current) {
                setUsername(text.trim() ? savedUsername(api.normalizeUrl(text)) : '');
              }
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!authLoading}
          />
          <View style={{ flexDirection: 'row', gap: s(10), marginTop: s(12) }}>
            <Hoverable
              style={[styles.serverUrlBtn, styles.serverUrlBtnReset, { flex: 1, height: s(44) }]}
              onPress={handleResetServerUrl}
              disabled={authLoading}
              hoverOpacity={0.8}
            >
              <Text style={[styles.serverUrlBtnResetText, { fontSize: s(14) }]}>Reset</Text>
            </Hoverable>
            <Hoverable
              style={[styles.serverUrlBtn, styles.serverUrlBtnSave, { flex: 1, height: s(44) }]}
              onPress={handleSaveServerUrl}
              disabled={authLoading}
              hoverOpacity={0.8}
            >
              <Text style={[styles.serverUrlBtnSaveText, { fontSize: s(14) }]}>Save</Text>
            </Hoverable>
          </View>
          {loopbackHint ? (
            <Text style={[styles.serverUrlHint, { fontSize: s(12), marginTop: s(8) }]}>{loopbackHint}</Text>
          ) : serverOffline ? (
            <Hoverable
              style={{ marginTop: s(8) }}
              onPress={schemeSuggestion ? handleUseSuggestedUrl : undefined}
              disabled={!schemeSuggestion}
              hoverOpacity={0.8}
            >
              <Text style={[styles.serverUrlHint, { fontSize: s(12) }]}>
                {schemeSuggestion
                  ? `Server not reachable — switch to ${schemeSuggestion}.`
                  : 'Server not reachable — check the address.'}
              </Text>
            </Hoverable>
          ) : null}
        </View>
      ) : null}

      <View
        style={[styles.logoTouch, { width: Math.min(s(320), width - 48), height: s(110), marginTop: s(12) }]}
        accessibilityRole="image"
        accessibilityLabel="Company logo"
      >
        <Image
          source={require('../../../assets/images/leadingedge.jpg')}
          style={{ width: '100%', height: '100%' }}
          resizeMode="contain"
        />
      </View>
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

  serverUrlCard: {
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignSelf: 'center',
  },

  serverUrlLabel: {
    color: '#4B5563',
    fontWeight: '700',
    letterSpacing: 1,
  },

  serverUrlInput: {
    backgroundColor: COLORS.white,
    color: COLORS.inputText,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    ...(Platform.OS === 'web' && { outlineStyle: 'none' } as object),
  },

  serverUrlBtn: {
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer', transition: 'all 0.15s ease' }),
  },

  serverUrlBtnReset: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },

  serverUrlBtnResetText: {
    color: '#111827',
    fontWeight: '600',
  },

  serverUrlBtnSave: {
    backgroundColor: COLORS.green,
  },

  serverUrlBtnSaveText: {
    color: COLORS.white,
    fontWeight: '700',
  },

  serverUrlHint: {
    color: '#B45309',
    fontWeight: '600',
    textAlign: 'center',
  },
});
