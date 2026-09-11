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
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { debugSetJson } from './portalDebug';
import type { Trip } from './tripCsv';
import { parsePortalCaptures, type PortalCapture, type PortalDuty } from './portalCapture';
import { buildInjectedJS, ROSTER_MONTH_OFFSETS } from './portalInjectedJs';
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
  const [urlText, setUrlText] = useState(portalUrl);
  const [currentUrl, setCurrentUrl] = useState(portalUrl);
  const [legCount, setLegCount] = useState(0);
  const [tripCount, setTripCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pageInfo, setPageInfo] = useState('');
  const [showData, setShowData] = useState(false);
  const captures = useRef<PortalCapture[]>([]);
  const reqLog = useRef<string[]>([]);
  const buildTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const built = useRef(false);

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
    if (msg.type !== 'capture') {
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
    const EXPECTED_ROSTER_PAYLOADS = ROSTER_MONTH_OFFSETS.length * 3;
    const rosterCount = captures.current.filter(c =>
      /selectPortalCalendar|selectCrewRosterReport/i.test(c.url || ''),
    ).length;
    const haveAll = rosterCount >= EXPECTED_ROSTER_PAYLOADS;
    if (buildTimer.current) {
      clearTimeout(buildTimer.current);
    }
    buildTimer.current = setTimeout(() => {
      if (built.current) {
        return;
      }
      const { trips, duties } = reparse();
      if (trips.length > 0) {
        built.current = true;
        onCaptured(trips, duties);
      }
    }, haveAll ? 600 : 4000);
  };

  const handleUse = () => {
    const { trips, duties } = reparse();
    if (trips.length === 0) {
      Alert.alert(
        'No roster captured yet',
        'Wait for the roster to load, or tap “View captured data” to inspect what came back.',
      );
      return;
    }
    onCaptured(trips, duties);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.bar}>
        <TouchableOpacity onPress={onClose} hitSlop={10}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.urlInput}
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
          <Text style={styles.go}>Go</Text>
        </TouchableOpacity>
      </View>

      <WebView
        source={{ uri: currentUrl }}
        injectedJavaScriptBeforeContentLoaded={injectedJS}
        onMessage={onMessage}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
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
        <View style={styles.loadingBar}>
          <ActivityIndicator color="#7b4fb8" size="small" />
        </View>
      )}

      <View style={styles.footer}>
        <View style={styles.statusWrap}>
          <Text style={styles.status} numberOfLines={1}>
            {tripCount > 0
              ? `Found ${tripCount} trip${tripCount === 1 ? '' : 's'} · ${legCount} flight${legCount === 1 ? '' : 's'}`
              : `Auto-logging in… ${captures.current.length} captured`}
          </Text>
          {!!pageInfo && (
            <Text style={styles.pageInfo} numberOfLines={1}>
              {pageInfo}
            </Text>
          )}
        </View>
        <TouchableOpacity style={styles.dataBtn} onPress={() => setShowData(true)}>
          <Text style={styles.dataBtnText}>View data ({captures.current.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.useBtn, tripCount === 0 && styles.useBtnDisabled]}
          onPress={handleUse}
          disabled={tripCount === 0}
          testID="use-captured-roster">
          <Text style={styles.useBtnText}>Use roster</Text>
        </TouchableOpacity>
      </View>

      {/* Captured-data inspector — lets us see the real portal JSON to tune the parser. */}
      <Modal visible={showData} animationType="slide" onRequestClose={() => setShowData(false)}>
        <SafeAreaView style={styles.dataModal}>
          <View style={styles.dataHeader}>
            <Text style={styles.dataTitle}>Captured payloads ({captures.current.length})</Text>
            <TouchableOpacity onPress={() => setShowData(false)} hitSlop={10}>
              <Text style={styles.go}>Done</Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
