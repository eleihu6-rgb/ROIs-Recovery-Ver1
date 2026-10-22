import { useEffect, useMemo, useRef } from 'react';
import { useAppSelector } from '../../store';
import { airlineByCode } from '../auth/airlines';
import { buildM5TripSnapshot, encodeM5TripSnapshot } from './m5DisplayModel';
import { sendM5DisplaySnapshot, subscribeM5DisplayStatus } from './m5DisplayModule';

export function useM5DisplaySync(): void {
  const trips = useAppSelector(state => state.trips.trips);
  const rosterBase = useAppSelector(state => state.auth.base);
  const airline = useAppSelector(state => state.auth.airline);
  const lastSent = useRef('');
  const base = rosterBase || airlineByCode(airline ?? '').portalConfig?.baseAirport || 'BKK';
  const payload = useMemo(
    () => encodeM5TripSnapshot(buildM5TripSnapshot(trips, base)),
    [trips, base],
  );

  useEffect(() => {
    const sendIfChanged = async () => {
      if (payload === lastSent.current) {
        return;
      }
      try {
        await sendM5DisplaySnapshot(payload);
        lastSent.current = payload;
      } catch {
        // A disconnected display is non-fatal; the native bridge reconnects when
        // the crew explicitly pairs again and this payload is retried on connect.
      }
    };
    void sendIfChanged();
    return subscribeM5DisplayStatus(status => {
      if (status === 'connected') {
        lastSent.current = '';
        void sendIfChanged();
      }
    });
  }, [payload]);
}
