// Profile ▸ Personal Information — what the session knows about the crew.
import React from 'react';
import { useAppSelector } from '../../store';
import { selectCrewCarrier, selectIsGuest } from '../auth/authSlice';
import { PROVIDER_LABELS, sessionDisplayName } from '../auth/identity';
import { useCarrier } from '../../theme/carrier';
import { SectionLabel } from '../../components/v2/rows';
import { PageShell, Hero, ListCard, KvRow } from './PageShell';
import { airlineByCode } from '../auth/airlines';
import { useBase } from './useV2';

export function PersonalInfoScreen() {
  const p = useCarrier();
  const crewId = useAppSelector(s => s.auth.crewId) ?? '';
  // Guest / social sessions have no crew record: the identity block below is
  // what the app actually knows about the person.
  const guest = useAppSelector(selectIsGuest);
  const provider = useAppSelector(s => s.auth.provider);
  const identityName = useAppSelector(s => sessionDisplayName(s.auth.displayName, s.auth.provider));
  const email = useAppSelector(s => s.auth.email);
  // Crew-facing identity: name the carrier the crew flies (roster-resolved),
  // not the sign-in option that fetched the roster.
  const airline = useAppSelector(selectCrewCarrier) ?? '';
  const baseTz = useAppSelector(s => s.settings.baseTimeZone);
  const base = useBase();
  const a = airlineByCode(airline);

  if (guest) {
    return (
      <PageShell title="Personal Information" testID="page-personal">
        <Hero h1={identityName} h2={`${PROVIDER_LABELS[provider ?? 'guest']} sign-in`} palette={p} />
        <SectionLabel palette={p}>Account</SectionLabel>
        <ListCard palette={p}>
          <KvRow label="Name" value={identityName} palette={p} />
          <KvRow label="Email" value={email ?? 'Not shared'} palette={p} />
          <KvRow label="Signed in with" value={PROVIDER_LABELS[provider ?? 'guest']} palette={p} />
          <KvRow label="Airline" value="Not signed in to an airline" palette={p} last />
        </ListCard>
      </PageShell>
    );
  }

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
