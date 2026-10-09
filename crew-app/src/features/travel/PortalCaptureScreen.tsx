import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { AppDialog } from '../../components/v2/AppDialog';
import { ALL_ORIENTATIONS } from '../../components/v2/useLayout';
import { debugSetJson } from './portalDebug';
import type { Trip } from './tripCsv';
import { parsePortalCaptures, type PortalCapture, type PortalDuty } from './portalCapture';
import { buildInjectedJS, ROSTER_MONTH_OFFSETS } from './portalInjectedJs';
import { createPortalClient } from '../portal/portalClient';
import { colors, font, space, radius } from '../../theme';
import { useCarrier } from '../../theme/carrier';
import type { PortalConfig } from '../auth/airlines';

// Crew-portal roster capture (doc/Add Trip Ver2). Loads the portal in a WebView,
// AUTO-LOGS-IN with the test crew, hooks fetch/XHR to capture the roster API JSON
// the SPA loads (/api/roster), parses it into trips, and auto-builds the trip.

const FALLBACK_URL = 'https://crew-sea-test.roiscloud.com/tg/portal/';

export function PortalCaptureScreen({
  onClose,
  onCaptured,
  portalUrl = FALLBACK_URL,
  crewId = '',
  password = '',
  carrier = 'TG',
  portalConfig,
}: {
  onClose: () => void;
  onCaptured: (trips: Trip[], duties: PortalDuty[]) => void;
  portalUrl?: string;
  crewId?: string;
  password?: string;
  carrier?: string;
  // Per-airline ROIS knobs (base tz/airport, login email-code). Absent = TG
  // defaults, so the historic THAI capture behaviour is unchanged.
  portalConfig?: PortalConfig | null;
}) {
  const palette = useCarrier();
  const nativeAuth = /roiscloud/i.test(portalUrl) && !!crewId && !!password;
  const [loginError, setLoginError] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [urlText, setUrlText] = useState(portalUrl);
  const [currentUrl, setCurrentUrl] = useState(portalUrl);
  const [legCount, setLegCount] = useState(0);
  const [tripCount, setTripCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pageInfo, setPageInfo] = useState('');
  const [showData, setShowData] = useState(false);
  // Product pop-up (pop-up standard: status card, not a native alert).
  const [dialog, setDialog] = useState<{ title: string; message: string } | null>(null);
  const captures = useRef<PortalCapture[]>([]);
  const reqLog = useRef<string[]>([]);
  const buildTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buildAt = useRef<number | null>(null);
  const built = useRef(false);
  const webRef = useRef<React.ElementRef<typeof WebView>>(null);
  // Token from the NATIVE portal login, handed to the page script. The in-page
  // directAuth needs JSEncrypt from a CDN, which the portal's CSP blocks ("JSEncrypt
  // CDN blocked (CSP)"), and PR's login form sits behind a splash the script
  // cannot dismiss — so a PR crew sat at "Auto-logging in…" forever. The app
  // already logs in natively for Duty Swap (bundled RSA); reuse that session.
  const nativeToken = useRef<string | null>(null);
  const loginFailed = useRef(false);
  const handToken = () => {
    const t = nativeToken.current;
    if (!t) return;
    webRef.current?.injectJavaScript(`window.__royceSetToken && window.__royceSetToken(${JSON.stringify(t)}); true;`);
  };
  useEffect(() => {
    if (!nativeAuth) return;
    let cancelled = false;
    const site = {
      apiBase: portalUrl.replace(/^(https?:\/\/[^/]+)(\/.*?)\/portal.*$/, '$1$2/apiPortal'),
      outCaptcha: portalConfig?.loginOutCaptcha,
    };
    createPortalClient({ airline: carrier, crewId, password }, { site })
      .token()
      .then(t => {
        if (cancelled) return;
        nativeToken.current = t;
        setAuthenticated(true);
        debugSetJson('@royce_debug_token', { type: 'token', src: 'native', len: t.length });
        handToken();
      })
      .catch(e => {
        if (cancelled) return;
        const reason = e instanceof Error ? e.message : '';
        const message = /password/i.test(reason)
          ? 'The crew portal did not accept your password. Check your credentials before trying again.'
          : /timeout|timed out|abort/i.test(reason)
            ? 'Portal sign-in timed out. Check your connection before trying again.'
            : 'Portal sign-in failed. Check your crew ID, password and required email code.';
        debugSetJson('@royce_debug_authresp', {
          type: 'authresp', source: 'native', crewId,
          status: e?.status, code: e?.code, failureCode: e?.failureCode, message,
        });
        loginFailed.current = true;
        if (buildTimer.current) clearTimeout(buildTimer.current);
        setLoginError(message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // The portal, crew and password are fixed for the life of this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cancel a pending debounced auto-build if the screen unmounts before it fires,
  // so onCaptured() can't run against a torn-down navigator (enhance-Ver3 impl #8).
  useEffect(() => {
    return () => {
      if (buildTimer.current) {
        clearTimeout(buildTimer.current);
      }
    };
  }, []);

  const injectedJS = buildInjectedJS(crewId, password, true, {
    outCaptcha: portalConfig?.loginOutCaptcha,
    nativeAuth,
  });

  const classify = (url: string): PortalCapture['source'] => {
    if (/roster|duty|pairing|schedule/i.test(url)) {
      return 'roster';
    }
    if (url === 'window-state') {
      return 'global';
    }
    return 'net';
  };

  const reparse = () => {
    const { trips, legCount: n, duties } = parsePortalCaptures(captures.current, crewId, carrier, {
      baseAirport: portalConfig?.baseAirport,
      baseOffsetMin: portalConfig?.baseOffsetMin,
    });
    setLegCount(n);
    setTripCount(trips.length);
    return { trips, duties };
  };

  const onMessage = (e: WebViewMessageEvent) => {
    if (loginFailed.current || built.current) return;
    let msg: any;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'page') {
      setPageInfo(`${msg.title || ''}  ${String(msg.url || '').replace(/^https?:\/\//, '')}`.trim());
      return;
    }
    if (msg.type === 'loginform') {
      // Debug: persist the login form structure for autonomous inspection.
      debugSetJson('@royce_debug_loginform', msg);
      return;
    }
    if (msg.type === 'logindiag') {
      debugSetJson('@royce_debug_logindiag', msg);
      return;
    }
    if (msg.type === 'req') {
      reqLog.current.push(`${msg.method} ${msg.url}`);
      debugSetJson('@royce_debug_reqs', reqLog.current.slice(-60));
      return;
    }
    if (msg.type === 'antd') {
      debugSetJson('@royce_debug_antd', msg);
      return;
    }
    if (msg.type === 'authresp') {
      debugSetJson('@royce_debug_authresp', msg);
      return;
    }
    if (msg.type === 'token') {
      // Token source + length only (never the token itself) — enhance-Ver3 #5.
      debugSetJson('@royce_debug_token', msg);
      return;
    }
    if (msg.type === 'reqh') {
      debugSetJson('@royce_debug_reqh', msg);
      return;
    }
    if (msg.type === 'storage') {
      debugSetJson('@royce_debug_storage', msg);
      return;
    }
    if (msg.type !== 'capture' || (nativeAuth && !nativeToken.current)) {
      return;
    }
    let body: unknown;
    try {
      body = JSON.parse(msg.body);
    } catch {
      body = msg.body;
    }
    const url = String(msg.url || '');
    // De-dupe by url+size so the polling scan doesn't pile up duplicates.
    const sig = `${url}|${msg.body.length}`;
    if (captures.current.some(c => `${c.url}|${JSON.stringify(c.body).length}` === sig)) {
      return;
    }
    captures.current.push({ source: classify(url), url, body });
    // Debug: persist redacted, size-capped captured payloads for inspection
    // (no-op in production — never retains raw portal bodies).
    debugSetJson('@royce_debug_caps', captures.current.map(c => ({ url: c.url, body: c.body })));
    reparse();
    // Debounced auto-build that waits for a COMPLETE roster. The injected JS
    // fetches a calendar + a report + a detail-all for each month offset
    // (3 × 3 = 9 payloads), in parallel. We build only once all expected roster
    // payloads have arrived (then a short 0.6s settle), so a slow leg isn't
    // missed — important now that onCaptured() does an authoritative replace and
    // the modal unmounts right after, dropping any straggler. A longer 4s
    // fallback still builds a partial roster if some month returns nothing.
    // (Note: the regex's selectPortalCalendar also matches the longer
    // selectPortalCalendarDetailAll, so all three per-month URLs are counted.)
    const rosterUrl = /selectPortalCalendar|selectCrewRosterReport/i;
    // Unrelated portal chatter cannot postpone an already usable roster.
    if (nativeAuth && !rosterUrl.test(url)) return;
    const EXPECTED_ROSTER_PAYLOADS = ROSTER_MONTH_OFFSETS.length * 3;
    const rosterCount = new Set(captures.current.filter(c => rosterUrl.test(c.url || '')).map(c => c.url)).size;
    const haveAll = rosterCount >= EXPECTED_ROSTER_PAYLOADS;
    const delay = haveAll ? 600 : 4000;
    const deadline = Date.now() + delay;
    // Completion may accelerate when all payloads arrive, but never slide
    // indefinitely as duplicate/updated portal responses keep arriving.
    if (buildAt.current !== null && buildAt.current <= deadline) return;
    if (buildTimer.current) clearTimeout(buildTimer.current);
    buildAt.current = deadline;
    buildTimer.current = setTimeout(() => {
      buildAt.current = null;
      if (built.current) {
        return;
      }
      const { trips, duties } = reparse();
      if (trips.length > 0) {
        built.current = true;
        onCaptured(trips, duties);
      }
    }, delay);
  };

  const handleUse = () => {
    if (built.current) return;
    const { trips, duties } = reparse();
    if (trips.length === 0) {
      setDialog({
        title: 'No roster captured yet',
        message: 'Wait for the roster to load, or tap “View captured data” to inspect what came back.',
      });
      return;
    }
    built.current = true;
    if (buildTimer.current) clearTimeout(buildTimer.current);
    onCaptured(trips, duties);
  };

  if (loginError) {
    // Unmount the WebView on rejection: its timers and form submissions stop.
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.cardSolid }]}>
        <View style={styles.loginFailure}>
          <Text style={[font.h1, { color: palette.cardInk }]}>Sign-in failed</Text>
          <Text style={[font.body, { color: palette.cardSoft }]}>{carrier} crew</Text>
          <Text testID="portal-login-identity" style={[font.title, { color: palette.cardInk }]}>{crewId}</Text>
          <Text testID="portal-login-error" style={[font.body, { color: palette.cardInk }]}>{loginError}</Text>
          <TouchableOpacity testID="portal-login-back" accessibilityRole="button" onPress={onClose}
            style={[styles.loginBack, { backgroundColor: palette.btn }]}>
            <Text style={[font.title, { color: colors.white }]}>Back to login</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, palette.isLight && { backgroundColor: palette.g1 }]}>
      <StatusBar barStyle="dark-content" />
      <View style={[styles.bar, palette.isLight && { borderBottomColor: palette.cardLine, backgroundColor: palette.card }]}>
        <TouchableOpacity onPress={onClose} hitSlop={10}>
          <Text style={[styles.cancel, palette.isLight && { color: palette.btn }]}>Cancel</Text>
        </TouchableOpacity>
        <TextInput
          style={[styles.urlInput, palette.isLight && { backgroundColor: palette.cardInset, color: palette.cardInk }]}
          value={urlText}
          onChangeText={setUrlText}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          selectTextOnFocus
          returnKeyType="go"
          onSubmitEditing={() => setCurrentUrl(urlText.trim())}
        />
        <TouchableOpacity onPress={() => setCurrentUrl(urlText.trim())} hitSlop={10}>
          <Text style={[styles.go, palette.isLight && { color: palette.btn }]}>Go</Text>
        </TouchableOpacity>
      </View>

      <WebView
        testID="portal-capture-web"
        ref={webRef}
        source={{ uri: currentUrl }}
        injectedJavaScriptBeforeContentLoaded={injectedJS}
        onMessage={onMessage}
        onLoadStart={() => setLoading(true)}
        // Re-hand the token after every page load: the SPA navigates (login →
        // roster) and each new document starts with an empty page state.
        onLoadEnd={() => { setLoading(false); handToken(); }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        startInLoadingState
        // @ts-ignore — available on RN WebView, lets Safari Web Inspector attach
        webviewDebuggingEnabled
        userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        style={styles.web}
      />

      {loading && (
        <View style={[styles.loadingBar, palette.isLight && { backgroundColor: palette.cardOverlay }]}>
          <ActivityIndicator color={palette.isLight ? palette.btn : '#7b4fb8'} size="small" />
        </View>
      )}

      <View style={[styles.footer, palette.isLight && { backgroundColor: palette.card, borderTopColor: palette.cardLine }]}>
        <View style={styles.statusWrap}>
          <Text testID="portal-login-identity" style={[styles.pageInfo, palette.isLight && { color: palette.cardSoft }]}>{crewId}</Text>
          <Text style={[styles.status, palette.isLight && { color: palette.cardInk }]} numberOfLines={1}>
            {tripCount > 0
              ? `Found ${tripCount} trip${tripCount === 1 ? '' : 's'} · ${legCount} flight${legCount === 1 ? '' : 's'}`
              : authenticated ? 'Loading roster…' : 'Signing in…'}
          </Text>
          {!!pageInfo && (
            <Text style={[styles.pageInfo, palette.isLight && { color: palette.cardSoft }]} numberOfLines={1}>
              {pageInfo}
            </Text>
          )}
        </View>
        <TouchableOpacity style={[styles.dataBtn, palette.isLight && { backgroundColor: palette.cardInset }]} onPress={() => setShowData(true)}>
          <Text style={[styles.dataBtnText, palette.isLight && { color: palette.cardInk }]}>View data ({captures.current.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.useBtn, tripCount === 0 && styles.useBtnDisabled, palette.isLight && { backgroundColor: tripCount === 0 ? palette.cardLine : palette.btn }]}
          onPress={handleUse}
          disabled={tripCount === 0}
          testID="use-captured-roster">
          <Text style={[styles.useBtnText, palette.isLight && tripCount === 0 && { color: palette.cardSoft }]}>Use roster</Text>
        </TouchableOpacity>
      </View>

      {/* Captured-data inspector — lets us see the real portal JSON to tune the parser. */}
      <Modal visible={showData} animationType="slide" onRequestClose={() => setShowData(false)} supportedOrientations={ALL_ORIENTATIONS}>
        <SafeAreaView style={[styles.dataModal, palette.isLight && { backgroundColor: palette.g1 }]}>
          <View style={[styles.dataHeader, palette.isLight && { borderBottomColor: palette.cardLine }]}>
            <Text style={[styles.dataTitle, palette.isLight && { color: palette.cardInk }]}>Captured payloads ({captures.current.length})</Text>
            <TouchableOpacity onPress={() => setShowData(false)} hitSlop={10}>
              <Text style={[styles.go, palette.isLight && { color: palette.btn }]}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.dataScroll} contentContainerStyle={{ padding: 12 }}>
            {captures.current.length === 0 && (
              <Text style={styles.dataEmpty}>Nothing captured yet.</Text>
            )}
            {[...captures.current]
              // Roster-looking captures first so the relevant JSON is on top.
              .sort((a, b) => (a.source === 'roster' ? -1 : 1) - (b.source === 'roster' ? -1 : 1))
              .map((c, i) => {
                const pretty = (() => {
                  try {
                    return JSON.stringify(c.body, null, 2).slice(0, 4000);
                  } catch {
                    return String(c.body).slice(0, 4000);
                  }
                })();
                return (
                  <View key={i} style={styles.dataItem}>
                    <Text style={styles.dataUrl} selectable>
                      [{c.source}] {c.url}
                    </Text>
                    <Text style={styles.dataBody} selectable>
                      {pretty}
                    </Text>
                  </View>
                );
              })}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <AppDialog
        visible={dialog !== null}
        onClose={() => setDialog(null)}
        onConfirm={() => setDialog(null)}
        tone="warning"
        title={dialog?.title ?? ''}
        message={dialog?.message}
        confirmLabel="Got it"
        testID="portal-capture-dialog"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loginFailure: { flex: 1, justifyContent: 'center', alignSelf: 'center', width: '100%', maxWidth: 560, padding: space.xl24, gap: space.md12 },
  loginBack: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, paddingHorizontal: space.lg16 },
  container: { flex: 1, backgroundColor: '#fff' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  cancel: { color: '#888', fontSize: 15, fontWeight: '600' },
  go: { color: '#7b4fb8', fontSize: 15, fontWeight: '700' },
  urlInput: {
    flex: 1,
    backgroundColor: '#f4f4f7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#1a1a2e',
  },
  web: { flex: 1 },
  loadingBar: {
    position: 'absolute',
    top: 50,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20,
    padding: 8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fafafe',
  },
  statusWrap: { flex: 1 },
  status: { fontSize: 13, color: '#666', fontWeight: '700' },
  pageInfo: { fontSize: 10, color: '#aaa', marginTop: 1 },
  dataBtn: {
    backgroundColor: '#eee',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  dataBtnText: { color: '#555', fontSize: 12, fontWeight: '700' },
  useBtn: {
    backgroundColor: '#7b4fb8',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  useBtnDisabled: { backgroundColor: '#c4b6e0' },
  useBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  dataModal: { flex: 1, backgroundColor: '#fff' },
  dataHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  dataTitle: { fontSize: 16, fontWeight: '800', color: '#1a1a2e' },
  dataScroll: { flex: 1, backgroundColor: '#1e1e2a' },
  dataEmpty: { color: '#888', fontSize: 13 },
  dataItem: { marginBottom: 16 },
  dataUrl: { color: '#7fd4a8', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  dataBody: { color: '#e0e0e8', fontSize: 10, fontFamily: 'Menlo' },
});
