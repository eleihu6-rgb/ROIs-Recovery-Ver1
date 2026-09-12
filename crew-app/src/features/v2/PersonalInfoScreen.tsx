// Profile ▸ Personal Information — what the session knows about the crew.
import React from 'react';
import { useAppSelector } from '../../store';
import { selectCrewCarrier } from '../auth/authSlice';
import { useCarrier } from '../../theme/carrier';
import { SectionLabel } from '../../components/v2/rows';
import { PageShell, Hero, ListCard, KvRow } from './PageShell';
import { airlineByCode } from '../auth/airlines';
import { useBase } from './useV2';

export function PersonalInfoScreen() {
  const p = useCarrier();
  const crewId = useAppSelector(s => s.auth.crewId) ?? '';
  // Crew-facing identity: name the carrier the crew flies (roster-resolved),
  // not the sign-in option that fetched the roster.
  const airline = useAppSelector(selectCrewCarrier) ?? '';
  const baseTz = useAppSelector(s => s.settings.baseTimeZone);
  const base = useBase();
  const a = airlineByCode(airline);
  return (
    <PageShell title="Personal Information" testID="page-personal">
      <Hero h1={`Crew ${crewId}`} h2={a.name} palette={p} />
      <SectionLabel palette={p}>Employment</SectionLabel>
      <ListCard palette={p}>
        <KvRow label="Airline" value={`${a.name} (${a.code})`} palette={p} />
        <KvRow label="Crew ID" value={crewId} palette={p} />
        <KvRow label="Base" value={base} palette={p} />
        <KvRow label="Base time zone" value={baseTz} palette={p} last />
      </ListCard>
    </PageShell>
  );
}
