import React from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/RootNavigator';
import { useAppDispatch, store } from '../../store';
import { syncCapturedTrips, setTrips } from '../travel/tripsSlice';
import { saveTrips } from '../travel/tripsPersistence';
import { setDuties, saveDuties } from '../roster/dutiesSlice';
import { PortalCaptureScreen } from '../travel/PortalCaptureScreen';
import { login } from './authSlice';
import { airlineByCode } from './airlines';
import type { Trip } from '../travel/tripCsv';
import type { PortalDuty } from '../travel/portalCapture';

type Props = NativeStackScreenProps<AuthStackParamList, 'Capture'>;

// Bridges login → portal capture → live session (doc/App Flow Ver1). The crew
// auto-signs in to the portal, we capture the roster + build trips, then mark the
// session logged-in (which flips RootNavigator to the main tabs).
export function LoginCaptureScreen({ route, navigation }: Props) {
  const dispatch = useAppDispatch();
  const { airline, crewId, password, keepLogin } = route.params;
  const airlineCfg = airlineByCode(airline);
  const portalUrl = airlineCfg.portalUrl ?? undefined;

  const onCaptured = async (trips: Trip[], duties: PortalDuty[]) => {
    // No PR/TG mixing (requirement): a FRESH login is one active crew. Normally a
    // switch goes through logout() (which wipes everything), but a relaunch without
    // logout (e.g. "keep me logged in" was off) can leave another crew's trips in
    // store — and syncCapturedTrips deliberately preserves other crews (for
    // same-account multi-crew refresh). So here, at the login boundary, drop any
    // trip that isn't this crew's before merging. (Duties are fully replaced below.)
    const existing = store.getState().trips.trips;
    const mine = existing.filter(t => t.crewId === crewId);
    if (mine.length !== existing.length) {
      dispatch(setTrips(mine));
    }
    // Authoritative replace for the captured crew+window so a fresh login does
    // not leave stale single-leg / dropped-duty cards behind.
    dispatch(syncCapturedTrips(trips));
    await saveTrips(trips);
    if (duties.length) {
      dispatch(setDuties(duties));
      await saveDuties(duties);
    }
    // Going live switches the navigator to the main tabs.
    dispatch(login({ airline, crewId, password, keepLogin }));
  };

  return (
    <PortalCaptureScreen
      portalUrl={portalUrl}
      crewId={crewId}
      password={password}
      carrier={airlineCfg.carrier}
      portalConfig={airlineCfg.portalConfig}
      onCaptured={onCaptured}
      onClose={() => navigation.goBack()}
    />
  );
}
