import { HelpStep, HelpNote, HelpControlsRef } from '../../help-article'
import { UserRound, List, BadgeCheck, Users } from 'lucide-react'

export default function LiveCrewInfo() {
  return (
    <>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        <strong>Crew Info</strong> is the crew member&apos;s personnel file — a summary of their profile
        plus every base, rank, fleet, qualification, certification, and team record the system keeps.
      </p>

      <HelpStep n={1}>
        <strong>Open it from the roster.</strong> Right-click a crew member&apos;s row background (the
        name cell area, not a task block) and choose <strong>Crew Info</strong>. It is available in
        both the Live and Scenario roster panes. The title shows the crew member&apos;s full name.
      </HelpStep>

      <HelpStep n={2}>
        <strong>Read the summary grid.</strong> The top area lists the crew member&apos;s basic profile
        fields — name, crew ID, base, rank, fleet, and other scalar attributes — in a compact grid.
        Blank values are shown as a dash.
      </HelpStep>

      <HelpStep n={3}>
        <strong>Read the record sections.</strong> Below the summary are six tables:{' '}
        <strong>Crew Base</strong>, <strong>Crew Rank</strong>, <strong>Crew Fleet</strong>,{' '}
        <strong>Crew Qualification</strong>, <strong>Crew Certification</strong>, and{' '}
        <strong>Crew Team</strong>. Each holds one record per row, sorted by effective date (most
        recent first); a section with no records shows <em>No records</em>.
      </HelpStep>

      <HelpNote>
        The record tables show only the meaningful fields for each record type — internal bookkeeping
        fields are hidden. Column headers are derived from the field names, so they read like{' '}
        <em>Seniority</em> for the seniority number.
      </HelpNote>

      <HelpControlsRef items={[
        { name: 'Crew Info', icon: <UserRound className="h-3.5 w-3.5" />, description: 'Opens the personnel file for the crew under the cursor. Right-click the row background → Crew Info.' },
        { name: 'Summary grid', icon: <List className="h-3.5 w-3.5" />, description: 'Basic profile fields (name, crew ID, base, rank, fleet, and other scalar attributes). Blank values show a dash.' },
        { name: 'Crew Base / Rank / Fleet', icon: <Users className="h-3.5 w-3.5" />, description: 'Record tables of the crew member’s base, rank, and fleet history, most recent first.' },
        { name: 'Crew Qualification / Certification', icon: <BadgeCheck className="h-3.5 w-3.5" />, description: 'Record tables of qualifications and certifications, most recent first.' },
        { name: 'Crew Team', icon: <Users className="h-3.5 w-3.5" />, description: 'Record table of the team memberships. Sections with no records show No records.' },
      ]} />
    </>
  )
}
