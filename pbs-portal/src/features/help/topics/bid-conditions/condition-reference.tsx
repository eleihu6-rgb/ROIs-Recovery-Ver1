import {
  HelpFieldTable,
  HelpH2,
  HelpList,
  HelpParagraph,
  HelpScreenshot,
  HelpTip,
} from "@/features/help/components/help-article";
import {
  BID_CONDITION_GROUP_LABELS,
  getBidConditionEntriesByGroup,
  getStandingBidConditionEntries,
  type BidConditionGroup,
  type BidConditionControlGuide,
  type BidConditionHelpEntry,
  type BidConditionScreenshot,
} from "@/features/help/topics/bid-conditions/condition-help-data";

const formatVisibleContexts = (entry: BidConditionHelpEntry): string =>
  entry.visibleContexts
    .map((context) => `${context.bidContext} / ${context.bidType} / ${context.propertyCode}`)
    .join(", ");

const BID_PROPERTY_ENTRY_SCREENSHOT: BidConditionScreenshot = {
  src: "/help/screenshots/bid-conditions-entry.png",
  alt: "Bid page Add Bid Properties area with category tabs and add buttons",
  caption: "Most conditions start from ADD BID PROPERTIES. Choose DAYS OFF, PAIRING, or ROSTER, then click the add button for the condition.",
};

const DAYS_OFF_CALENDAR_ENTRY_SCREENSHOT: BidConditionScreenshot = {
  src: "/help/screenshots/bid-conditions-days-off-calendar-entry.png",
  alt: "Left BIDDING CALENDAR date action popover for adding a Days Off bid",
  caption: "You can also add Days Off from the left BIDDING CALENDAR by clicking a date, choosing Tiers, and saving the bid.",
};

const PAIRING_CALENDAR_ENTRY_SCREENSHOT: BidConditionScreenshot = {
  src: "/help/screenshots/bid-conditions-pairing-calendar-entry.png",
  alt: "Left BIDDING CALENDAR pairing event detail dialog",
  caption: "Pairing entries on the left BIDDING CALENDAR can be opened when you are working from a visible exact pairing. Use ADD BID PROPERTIES for broader pairing rules.",
};

const GROUP_ENTRY_SCREENSHOTS: Record<BidConditionGroup, BidConditionScreenshot[]> = {
  "days-off": [DAYS_OFF_CALENDAR_ENTRY_SCREENSHOT],
  pairing: [PAIRING_CALENDAR_ENTRY_SCREENSHOT],
  "roster-line": [BID_PROPERTY_ENTRY_SCREENSHOT],
  reserve: [],
};

const renderScreenshots = (screenshots: BidConditionScreenshot[]) => screenshots.map((screenshot) => (
  <HelpScreenshot key={screenshot.src} {...screenshot} />
));

const GroupVisualGuide = ({ group }: { group: BidConditionGroup }) => {
  const screenshots = GROUP_ENTRY_SCREENSHOTS[group];

  return (
    <>
      <HelpH2>{BID_CONDITION_GROUP_LABELS[group]} entry points</HelpH2>
      {screenshots.length > 0 ? (
        renderScreenshots(screenshots)
      ) : (
        <HelpParagraph>
          Reserve Preference is opened from the ROSTER category in Bid or Standing Bid.
        </HelpParagraph>
      )}
      <HelpFieldTable
        title="Basic flow"
        items={[
          { label: "Choose Tiers", details: "Select T1-T7 first so the Portal knows where the preference belongs." },
          { label: "Complete fields", details: "Each condition has its own dialog. Use the screenshot and field guide below for the exact controls." },
          { label: "Save", details: "ADD BID or SAVE BID attaches the condition to the selected Tier. Search and filter fields alone do not save a bid." },
        ]}
      />
      {group === "days-off" ? (
        <HelpFieldTable
          title="Two ways to start"
          items={[
            { label: "Calendar-first", details: "Click a date in the left BIDDING CALENDAR when the day itself is the starting point. The date is prefilled for the Days Off bid." },
            { label: "Condition-first", details: "Use ADD BID PROPERTIES -> DAYS OFF when the condition type is the starting point, then choose dates, date ranges, weekdays, or weekends inside the dialog." },
          ]}
        />
      ) : null}
      {group === "pairing" ? (
        <>
          <HelpFieldTable
            title="Two ways to start"
            items={[
              { label: "Calendar-first", details: "Click a visible pairing entry in the left BIDDING CALENDAR when you want to work from that exact pairing entry or review its Tier attachment." },
              { label: "Condition-first", details: "Use ADD BID PROPERTIES -> PAIRING when you want to add a pairing rule such as check-in time, length, station, flight number, DHD, Redeye, or Pairing Preference." },
            ]}
          />
          <HelpFieldTable
            title="Date-scope labels"
            items={[
              { label: "Event Date", details: "The date of the event evaluated by that condition, such as a check-in/check-out event, duty event, work-day event, or airport event." },
              { label: "Flight Date", details: "The operating date of a flight leg inside the pairing. Flight Number Preference, Redeye Preference, and Deadhead Flying use this label." },
              { label: "Pairing Start Date", details: "The first calendar date of the pairing. A multi-day pairing still has one pairing start date." },
              { label: "Reserve Date Scope", details: "Reserve Preference only. It chooses when the reserve request is active; it is not a pairing event, flight, or pairing-start date limit." },
              { label: "Switch off / on", details: "Off does not disable the bid. Off means no extra date restriction; On adds Specific Dates or Date Range on top of the saved rule." },
            ]}
          />
        </>
      ) : null}
    </>
  );
};

const ControlGuideItem = ({ control }: { control: BidConditionControlGuide }) => (
  <div className="rounded-xl border border-[#e4e8f0] bg-[#fbfcff] p-3">
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,360px)]">
      <div className="min-w-0">
        <h4 className="m-0 text-sm font-bold leading-5 text-[#34394a]">{control.label}</h4>
        <p className="m-0 mt-1 text-sm font-medium leading-6 text-[#606778]">{control.details}</p>
        {control.commonMistake ? (
          <p className="m-0 mt-2 text-xs font-semibold leading-5 text-[#8a5b24]">
            Watch out: {control.commonMistake}
          </p>
        ) : null}
      </div>
      {control.screenshot ? (
        <div className="min-w-0 [&_figure]:my-0 [&_figcaption]:text-left">
          <HelpScreenshot {...control.screenshot} />
        </div>
      ) : null}
    </div>
  </div>
);

const ControlGuideList = ({ controls, entryId }: { controls: BidConditionControlGuide[]; entryId: string }) => {
  if (controls.length === 0) {
    return null;
  }

  return (
    <section className="my-4" data-testid={`help-bid-condition-controls-${entryId}`}>
      <h4 className="mb-2 mt-0 text-xs font-bold uppercase tracking-[0.08em] text-[#7f8392]">
        Key controls
      </h4>
      <div className="space-y-3">
        {controls.map((control) => (
          <ControlGuideItem key={`${entryId}-${control.label}`} control={control} />
        ))}
      </div>
    </section>
  );
};

const BidConditionCard = ({ entry }: { entry: BidConditionHelpEntry }) => (
  <article
    id={`help-condition-${entry.id}`}
    className="rounded-2xl border border-[#e3e7ef] bg-white p-4 shadow-[0_8px_20px_rgba(36,39,45,0.04)]"
    data-help-condition-id={entry.id}
    data-testid={`help-bid-condition-${entry.id}`}
  >
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="m-0 text-base font-bold leading-6 text-[#282c3b]">{entry.name}</h3>
        <p className="m-0 mt-1 text-xs font-semibold leading-5 text-[#7f8392]">
          Property {entry.propertyCode} · {BID_CONDITION_GROUP_LABELS[entry.group]}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {entry.availableIn.map((context) => (
          <span
            key={`${entry.id}-${context}`}
            className="inline-flex h-6 items-center rounded-full border border-[#cfd6e4] bg-[#f8f9fc] px-2.5 text-xs font-bold leading-4 text-[#596174]"
          >
            {context}
          </span>
        ))}
      </div>
    </div>

    <p className="mb-0 mt-3 text-sm font-medium leading-6 text-[#4f5670]">{entry.purpose}</p>

    <div data-testid={`help-bid-condition-screenshot-${entry.id}`}>
      <HelpScreenshot {...entry.screenshot} />
    </div>

    <HelpFieldTable
      title="Where to open it"
      items={entry.openFrom.map((source, index) => ({
        label: index === 0 ? "Primary" : `Also ${index}`,
        details: source,
      }))}
    />

    <HelpFieldTable
      title="How to configure it"
      items={[
        {
          label: "Steps",
          details: <HelpList items={entry.setupSteps} />,
        },
        {
          label: "Fields",
          details: (
            <dl className="m-0 space-y-2">
              {entry.fieldDetails.map((item) => (
                <div key={`${entry.id}-${item.label}`}>
                  <dt className="font-bold text-[#40424f]">{item.label}</dt>
                  <dd className="m-0 text-[#6f7485]">{item.details}</dd>
                </div>
              ))}
            </dl>
          ),
        },
      ]}
    />

    <ControlGuideList controls={entry.controlGuides ?? []} entryId={entry.id} />

    <div
      className="mt-3 rounded-xl border border-[#d8ddf3] bg-[#f7f8ff] px-3 py-2 text-sm font-semibold leading-6 text-[#4f5670]"
      data-testid={`help-bid-condition-example-${entry.id}`}
    >
      <span className="text-[#6467d1]">Example: </span>
      {entry.example}
    </div>

    <HelpFieldTable
      title="After saving"
      items={[
        {
          label: "Result",
          details: <HelpList items={entry.saveResult} />,
        },
        {
          label: "Watch out",
          details: <HelpList items={entry.watchOut} />,
        },
      ]}
    />

    <p className="m-0 text-xs font-semibold leading-5 text-[#8a90a1]">
      Catalog coverage: {formatVisibleContexts(entry)}
    </p>
  </article>
);

const BidConditionCards = ({ entries }: { entries: BidConditionHelpEntry[] }) => (
  <div className="my-4 space-y-4">
    {entries.map((entry) => (
      <BidConditionCard key={entry.id} entry={entry} />
    ))}
  </div>
);

export const GroupedBidConditionsReference = ({ group }: { group: BidConditionGroup }) => (
  <>
    <GroupVisualGuide group={group} />
    <HelpH2>{BID_CONDITION_GROUP_LABELS[group]} condition list</HelpH2>
    <HelpParagraph>
      These are the currently visible {BID_CONDITION_GROUP_LABELS[group]} bid conditions with supported editors.
    </HelpParagraph>
    <BidConditionCards entries={getBidConditionEntriesByGroup(group)} />
  </>
);

export const StandingBidConditionsReference = () => (
  <>
    <HelpH2>Standing Bid condition list</HelpH2>
    <HelpParagraph>
      Standing Bid stores reusable long-term preferences. It does not show conditions that depend on a specific
      current-period pairing occurrence.
    </HelpParagraph>
    <HelpTip>
      Standing Bid is best for patterns you want to reuse. For example, weekday off patterns and pairing length rules
      can be reused; exact current-period pairing rows cannot.
    </HelpTip>
    <HelpFieldTable
      title="Standing Bid coverage"
      items={[
        { label: "Lineholder", details: "Days Off, Pairing, and Roster / Line conditions that are reusable." },
        { label: "Roster", details: "Reserve Preference is shown under ROSTER but is still saved internally to the StandingReserve draft." },
        { label: "Current-only", details: "Pairing Preference is Current Bid only because it saves selected current-period pairings." },
      ]}
    />
    <BidConditionCards entries={getStandingBidConditionEntries()} />
  </>
);
