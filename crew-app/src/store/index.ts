import { configureStore } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import authReducer from '../features/auth/authSlice';
import tripsReducer from '../features/travel/tripsSlice';
import alarmsReducer from '../features/alarms/alarmsSlice';
import dutiesReducer from '../features/roster/dutiesSlice';
import settingsReducer from '../features/settings/settingsSlice';
import meetingsReducer from '../features/meetings/meetingsSlice';
import flightCalendarReducer from '../features/calendar/flightCalendarSlice';
import tripTradeReducer from '../features/tripTrade/tripTradeSlice';
import notificationsReducer from '../features/notifications/notificationsSlice';
import rbotReducer from '../features/rbot/rbotSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    trips: tripsReducer,
    alarms: alarmsReducer,
    duties: dutiesReducer,
    settings: settingsReducer,
    meetings: meetingsReducer,
    flightCalendar: flightCalendarReducer,
    tripTrade: tripTradeReducer,
    notifications: notificationsReducer,
    rbot: rbotReducer,
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Typed hooks — use these throughout the app instead of plain useDispatch/useSelector
export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
