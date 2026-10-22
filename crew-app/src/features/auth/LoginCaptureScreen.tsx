import React from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/RootNavigator';
import { useAppDispatch, useAppSelector } from '../../store';
import { setTrips } from '../travel/tripsSlice';
import { saveTrips } from '../travel/tripsPersistence';
import { setDuties, saveDuties } from '../roster/dutiesSlice';
import { PortalCaptureScreen } from '../travel/PortalCaptureScreen';
import { login } from './authSlice';
import { airlineByCode } from './airlines';
import type { Trip } from '../travel/tripCsv';
import type { PortalDuty } from '../travel/portalCapture';
import {CarrierContext, paletteFor, resolveTheme} from '../../theme/carrier';

type Props = NativeStackScreenProps<AuthStackParamList, 'Capture'>;

// Bridges login → portal capture → live session (doc/App Flow Ver1). The crew
// auto-signs in to the portal, we capture the roster + build trips, then mark the
// session logged-in (which flips RootNavigator to the main tabs).
export function LoginCaptureScreen({ route, navigation }: Props) {
  const dispatch = useAppDispatch();
  const { airline, crewId, password, keepLogin } = route.params;
  const airlineCfg = airlineByCode(airline);
  const portalUrl = airlineCfg.portalUrl ?? undefined;
  const chosenTheme = useAppSelector(s => s.settings.themePreset);
  const palette = paletteFor(resolveTheme(chosenTheme, airline));

  const onCaptured = async (trips: Trip[], duties: PortalDuty[]) => {
    // A fresh login has exactly one active airline + crew. Replace the in-memory
    // roster just as persistence does: filtering by crewId alone can retain data
    // from another airline whose crew happens to use the same numeric ID.
    dispatch(setTrips(trips));
    dispatch(setDuties(duties));
    await saveTrips(trips);
    await saveDuties(duties);
    // Going live switches the navigator to the main tabs.
    dispatch(login({ airline, crewId, password, keepLogin }));
  };

  return (
    <CarrierContext.Provider value={palette}>
      <PortalCaptureScreen
        portalUrl={portalUrl}
        crewId={crewId}
        password={password}
        carrier={airlineCfg.carrier}
        portalConfig={airlineCfg.portalConfig}
        onCaptured={onCaptured}
        onClose={() => navigation.goBack()}
      />
    </CarrierContext.Provider>
  );
}
