import AsyncStorage from '@react-native-async-storage/async-storage';
import { logout } from '../../src/features/auth/authSlice';

// Logout must clean up EVERYTHING for the crew: scheduled alarms (native, no-op
// in tests), trips + duties (Redux + AsyncStorage), and the session. This guards
// the "stale records / alarms left behind after a new login" bug.
describe('logout cleanup', () => {
  it('clears trips + duties from Redux and AsyncStorage and clears the session', async () => {
    await AsyncStorage.setItem('@royce_trips', JSON.stringify([{ id: 'x' }]));
    await AsyncStorage.setItem('@royce_duties', JSON.stringify([{ id: 'y' }]));

    const dispatched: any[] = [];
    // Thunks take a typed AppDispatch; a recording spy stands in for it here.
    await logout()(((a: any) => dispatched.push(a)) as any);

    const types = dispatched.map(a => a.type);
    expect(types).toContain('trips/clearTrips');
    expect(types).toContain('duties/setDuties'); // setDuties([])
    expect(types).toContain('auth/_clearSession');
    const setDuties = dispatched.find(a => a.type === 'duties/setDuties');
    expect(setDuties.payload).toEqual([]);

    expect(await AsyncStorage.getItem('@royce_trips')).toBeNull();
    expect(await AsyncStorage.getItem('@royce_duties')).toBeNull();
  });
});
