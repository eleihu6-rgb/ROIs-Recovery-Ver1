// My Trips · Add-Trip / Show choosers.
//
// Pop-up standard: the multi-option menus render through AppDialog's children
// escape hatch (the shared status-card chrome), not a native action sheet.
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Provider } from 'react-redux';

import { store } from '../../src/store';
import { MyTripsScreen } from '../../src/features/travel/MyTripsScreen';

// MyTripsScreen transitively imports the WebView + document-picker (the capture
// paths) — stub them so the screen can mount under Jest's node env.
jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('react-native-document-picker', () => ({
  __esModule: true,
  default: { pick: jest.fn(), types: {} },
  types: {},
  isCancel: () => false,
}));

function renderScreen() {
  return render(
    <Provider store={store}>
      <MyTripsScreen />
    </Provider>,
  );
}

describe('MyTrips · pop-up menus', () => {
  it('opens the Add-Trip chooser as a pop-up with both capture paths', () => {
    const tree = renderScreen();

    fireEvent.press(tree.getByTestId('add-trip-header'));

    expect(tree.getByTestId('mytrips-dialog-title').props.children).toBe('Add Trip');
    expect(tree.getByText('How would you like to add your trip?')).toBeTruthy();
    expect(tree.getByTestId('mytrips-import-csv')).toBeTruthy();
    expect(tree.getByTestId('mytrips-capture-portal')).toBeTruthy();
  });

  it('applies an agenda filter chosen from the Show pop-up, then closes it', () => {
    const tree = renderScreen();

    fireEvent.press(tree.getByTestId('filter-agenda'));
    expect(tree.getByTestId('mytrips-dialog-title').props.children).toBe('Show');
    // The current filter is ticked in the chooser.
    expect(tree.getByText(/All/)).toBeTruthy();

    fireEvent.press(tree.getByTestId('mytrips-filter-work'));

    expect(store.getState().alarms.agendaFilter).toBe('work');
    expect(tree.queryByTestId('mytrips-dialog-title')).toBeNull();
  });
});
