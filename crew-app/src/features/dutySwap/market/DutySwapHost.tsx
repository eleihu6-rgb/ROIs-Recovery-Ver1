// Home ▸ Quick actions ▸ Duty Swap: hosts the two ways of swapping and the
// switch between them — Matrix (Concept D, DutySwapScreen) and Market (Concept
// A, MarketScreen). The crew's choice is remembered per crew on this phone.
// Switch placement: Duo inner screen landscape → a rail in the right-edge status
// strip under the clock (as Schedule's roster-view rail); compact / tall → the
// page header, in place of the title.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientScreen } from '../../../components/v2/GradientScreen';
import { useLayout } from '../../../components/v2/useLayout';
import { useAppDispatch, useAppSelector } from '../../../store';
import { setDutySwapApproach } from '../../rbot/rbotSlice';
import { useCarrier } from '../../../theme/carrier';
import { useV2Nav } from '../../v2/nav';
import { DutySwapScreen } from '../DutySwapScreen';
import { ApproachSwitch, RAIL_TOP, RAIL_W, SwapRailActions, useSwapApproach } from './ApproachSwitch';
import { MarketScreen } from './MarketScreen';
import { TicketScreen } from './TicketScreen';

export function DutySwapHost(): React.JSX.Element {
  const p = useCarrier();
  const insets = useSafeAreaInsets();
  const { wide } = useLayout();
  const nav = useV2Nav();
  const dispatch = useAppDispatch();
  const auth = useAppSelector(s => s.auth);
  const [approach, choose] = useSwapApproach(auth.airline, auth.crewId);
  React.useEffect(() => { if (approach) dispatch(setDutySwapApproach(approach)); }, [approach, dispatch]);
  const [rbotOpen, setRbotOpen] = React.useState(false);
  // The pages keep their side insets (GradientScreen), so the strip right of
  // them is free for the rail.
  const railInStrip = wide && insets.right >= RAIL_W;

  if (!approach) return <GradientScreen palette={p} texture={false} />;
  const header = railInStrip ? undefined : <ApproachSwitch palette={p} value={approach} onChange={choose} variant="header" />;
  return (
    <View style={s.fill} testID="duty-swap-host">
      {approach === 'market' ? <MarketScreen switcher={header} actionsInRail={railInStrip} /> : approach === 'ticket' ? (
        <TicketScreen switcher={header} actionsInRail={railInStrip} />
      ) : <DutySwapScreen switcher={header} rbot={{ open: rbotOpen, setOpen: setRbotOpen, inRail: railInStrip }} />}
      {railInStrip ? (
        <View style={[s.railEdge, { width: insets.right }]} testID="swap-approach-rail-edge">
          <ApproachSwitch palette={p} value={approach} onChange={choose} variant="rail" />
          <SwapRailActions palette={p}
            onRecords={() => nav.navigate('DutySwapRecords')}
            onMyDuties={() => nav.navigate('DutySwapMyDuties')}
            rbotOpen={rbotOpen}
            onToggleRbot={approach === 'matrix' ? () => setRbotOpen(open => !open) : undefined} />
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  // In the status strip, below the clock and Wi-Fi.
  railEdge: { position: 'absolute', right: 0, top: RAIL_TOP, alignItems: 'center' },
});
