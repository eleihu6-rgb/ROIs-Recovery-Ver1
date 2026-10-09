import React from 'react';
import { Dimensions } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { GradientScreen } from '../../src/components/v2/GradientScreen';
import { PALETTES } from '../../src/theme/carrier';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 20, left: 0 }),
}));

it('resizes the painted gradient across iPad rotation and a narrow window', () => {
  const original = Dimensions.get('window');
  const tree = render(<GradientScreen palette={PALETTES.sia} />);
  try {
    for (const [width, height] of [[834, 1210], [1210, 834], [597, 834], [951, 669], [420, 912]]) {
      act(() => Dimensions.set({ window: { ...original, width, height } }));
      expect(tree.getByTestId('screen-gradient').props).toMatchObject({ width, height });
      expect(tree.getByTestId('screen-gradient-paint').props).toMatchObject({ width, height });
    }
  } finally {
    tree.unmount();
    Dimensions.set({ window: original });
  }
});
