import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import { Hero, KvRow, PageShell } from '../../src/features/v2/PageShell';
import { SectionLabel } from '../../src/components/v2/rows';
import { PALETTES } from '../../src/theme/carrier';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn() }),
}));

const styleFor = (tree: ReturnType<typeof render>, text: string) =>
  StyleSheet.flatten(tree.getByText(text).props.style);

describe('Personal Information typography', () => {
  it('keeps the crew identity one tier above iOS Settings rows', () => {
    const palette = PALETTES.sia;
    const tree = render(
      <PageShell
        title="Personal Information"
        hero={<Hero h1="Crew 433535" h2="Philippine Airlines" palette={palette} />}
      >
        <SectionLabel palette={palette}>Employment</SectionLabel>
        <KvRow label="Crew ID" value="433535" palette={palette} last />
      </PageShell>,
    );

    expect(styleFor(tree, 'Personal Information')).toMatchObject({ fontSize: 17, fontWeight: '600' });
    expect(styleFor(tree, 'Crew 433535')).toMatchObject({ fontSize: 20, fontWeight: '600' });
    expect(styleFor(tree, 'Philippine Airlines')).toMatchObject({ fontSize: 15, lineHeight: 20 });
    expect(styleFor(tree, 'Employment')).toMatchObject({ fontSize: 13 });
    expect(styleFor(tree, 'Crew ID')).toMatchObject({ fontSize: 17, fontWeight: '400' });
    expect(styleFor(tree, '433535')).toMatchObject({ fontSize: 17 });
  });
});
