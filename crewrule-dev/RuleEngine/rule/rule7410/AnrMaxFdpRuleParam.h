/**
 * @file AnrMaxFdpRuleParam.h
 *
 * Parameter model for ANR FDP limit rule 7410.
 *
 * Table 1 (Max FDP rows) and Table 2 (control parameters) are both mapped
 * from DBRule records for function 7410 using tableNum = 1 and 2.
 */

#ifndef _ANR_MAX_FDP_RULE_PARAM_H_
#define _ANR_MAX_FDP_RULE_PARAM_H_

#include "CrewDB.h"
#include "MinimumLegalComplementTypes.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include "../constant/Constants.h"

#include <string>
#include <vector>
#include <limits>

class Duty;
struct RuleInput;

struct AnrMaxFdpRow {
    long long idRule{0};
    long long idRuleParam{ 0 };
    std::string overrideAbility;
    std::string classType;
    std::string description;
    std::string reference;
    int rowNum{0};

    // Filter fields (all minutes unless noted)
    int tzDiffMinutesLower{0};        // inclusive
    int tzDiffMinutesUpper{24 * 60};  // inclusive

    std::vector<std::string> compositions; // empty or {"*"} => wildcard

    // Rest facility filter: -1 means "any"
    int restFacility{-1};

    // Report local time window [start, end] minutes-of-day (00:00-23:59)
    int reportStartMinutes{0};
    int reportEndMinutes{24 * 60 - 1};

    int sectorLower{0};                // inclusive
    int sectorUpper{std::numeric_limits<int>::max()}; // inclusive

    // FDP range filter (minutes), inclusive; defaults to wildcard
    int fdpRangeMinutesLower{0};
    int fdpRangeMinutesUpper{std::numeric_limits<int>::max()};

    // Max FDP in minutes (regulatory value, without buffer)
    int maxFdpMinutes{0};
};

struct AnrMaxFdpControl {
    // Whether to count non-operating flight sectors (deadhead etc.) in sector count.
    bool countDeadheadSectors{true};
    // When true, trailing deadhead sectors after the final operating leg are excluded.
    bool excludeFinalDeadheadSectors{false};
    // Global FDP buffer in minutes applied in checks (not in stored limit).
    int globalBufferMinutes{30};
    // When enabled, compute MAX FDP as:
    //   (FD base max FDP) + (duty report minutes - FD report minutes)
    // Default is off so that FD scenarios are unaffected unless explicitly configured.
    bool applyReportTimeDifference{false};
    // ULR duties with exactly one segment are exempted from MAX FDP when composition matches.
    // Value is case-sensitive; "*" means any composition.
    std::string ulrExemptionComposition;
    // ULR duties with exactly one segment are exempted from MAX FDP when rest facility matches.
    // -2 means "not configured", -1 means wildcard (any).
    int ulrExemptionRestFacility{-2};

    bool shouldCountDeadheads() const { return countDeadheadSectors; }
    bool shouldCountFinalDeadheads() const {
        return countDeadheadSectors && !excludeFinalDeadheadSectors;
    }
};

struct AnrSectorCountRow {
    int lengthLowerMinutes{0};      // inclusive lower bound
    int lengthUpperMinutes{0};      // inclusive upper bound
    int tzDiffMinutesLower{0};      // inclusive lower bound
    int tzDiffMinutesUpper{24 * 60}; // inclusive upper bound
    int sectorValue{1};             // adjusted sector value (e.g. 2,3,4)
};

struct AnrCcAugmentedMaxFdpRow {
    struct StationPattern {
        bool allowAny{true};
        bool isNegated{false};
        std::vector<std::string> values{};

        bool matches(const std::string& candidate) const {
            if (allowAny) {
                return true;
            }
            bool contains = false;
            for (const auto& value : values) {
                if (value == candidate) {
                    contains = true;
                    break;
                }
            }
            return isNegated ? !contains : contains;
        }

        std::string toDisplayString() const {
            if (allowAny || values.empty()) {
                return "*";
            }
            std::string valueText;
            for (std::size_t i = 0; i < values.size(); ++i) {
                if (i > 0) {
                    valueText += "|";
                }
                valueText += values[i];
            }
            if (!isNegated) {
                return valueText;
            }
            if (values.size() == 1) {
                return "!" + valueText;
            }
            return "!(" + valueText + ")";
        }
    };

    long long idRule{0};
    std::string overrideAbility;
    std::string description;
    std::string reference;
    int rowNum{0};

    std::vector<std::string> compositions; // empty or {"*"} => wildcard
    int restFacility{-1}; // -1 means "any"
    // FDP range filter (minutes), inclusive; defaults to wildcard.
    int fdpRangeMinutesLower{0};
    int fdpRangeMinutesUpper{std::numeric_limits<int>::max()};

    // Duty start station filter, e.g. "SIN", "!SIN", "*".
    StationPattern dutyStartPattern{};
    // Has sector filter, e.g. "SIN-*", "!SIN-*", "*-SIN", "SIN-JFK".
    StationPattern sectorDepPattern{};
    StationPattern sectorArrPattern{};

    // Minimum fly time in minutes for the matching sector(s).
    int sectorMinFlyMinutes{0};

    // Max FDP in minutes.
    int maxFdpMinutes{0};
};

struct AnrMaxFdpLimit {
    long long idRule{0};
    long long idRuleParam{0};
    std::string overrideAbility;
    std::string classType;
    std::string description;
    std::string reference;
    int maxFdpMinutes{-1};
    bool applyReportTimeDifference{false};
    bool reportTimeDeltaAvailable{false};
    int reportTimeDeltaMinutes{0}; // CC report minutes - FD report minutes
	const AnrMaxFdpRow* baseFDPRow{ nullptr };
	const AnrCcAugmentedMaxFdpRow* ccAugmentedRow{ nullptr };
    bool hasCcAugmentedTable{false};
    bool ccAugmentedConfiguredButNoMatch{false};
    int unmatchedCcAugmentedMaxSectorBlockMinutes{-1};
    int unmatchedCcAugmentedRestFacility{-1};
    std::string unmatchedCcAugmentedDutyStartStation;
};

class AnrMaxFdpRuleParam : public RuleParam {
public:
    explicit AnrMaxFdpRuleParam(const Rule* rule) : RuleParam(rule) {}

    constexpr static unsigned int RuleFuncId = RULES::ANR_MAX_FLIGHT_DUTY_PERIOD;

    void ParseFromRuleInput(const RuleInput& input);

    const std::vector<AnrMaxFdpRow>& getRows() const { return _rows; }
    const AnrMaxFdpControl& getControl() const { return _control; }

    /**
     * Find the first matching row for the given duty using the configured filters.
     * Returns nullptr when no row matches.
     */
    const AnrMaxFdpRow* findMatchingRow(const Duty* duty,
                                        const SharedPtr<CrewDataContext>& dbData,
                                        int application) const;

    /**
     * Find the effective MAX FDP limit for a duty using the first matching 7410 row.
     * 7413 (extended FDP table) is considered only when duty FDP exceeds
     * the matched 7410 max FDP; detailed applicability is determined by
     * matching 7413 table rows.
     * Returns false when there is no matching 7410 row.
     */
    bool findEffectiveLimit(const Duty* duty,
                            const SharedPtr<CrewDataContext>& dbData,
                            int application,
                            AnrMaxFdpLimit& outLimit) const;

    /**
     * Count sectors for this duty according to the control flags and sector
     * length adjustment definitions (rule 7411). TZ diff is in minutes.
     */
    int countSectors(const Duty* duty, int tzDiffMinutes) const;

    MinimumLegalComplementCoverage getNoPairingMinimumComplementCoverage(
        const Duty* duty,
        const SharedPtr<CrewDataContext>& dbData,
        int application) const;

public:
    struct BaseRowMatchContext {
        std::string composition;
        int dutyRestFacility = -1;
		int dutySectors = 0;
        int dutyFdpMinutes = 0;
        int reportTimeDeltaMinutes = 0;
        time_t checkInLocal = 0;
        bool isDutyStartAtBase = false;
    };

    struct PoCoverageLimitSummary {
        bool hasRows = false;
        int minMaxFdpMinutes = std::numeric_limits<int>::max();
        int maxMaxFdpMinutes = std::numeric_limits<int>::min();
    };

    struct PoCoverageReportGroup {
        int reportStartMinutes = 0;
        int reportEndMinutes = 24 * 60 - 1;
        PoCoverageLimitSummary limits;
        std::vector<int> rowIndexes;
    };

    struct PoCoverageRestFacilityGroup {
        int restFacility = -1;
        PoCoverageLimitSummary limits;
        std::vector<int> allRowIndexes;
        std::vector<PoCoverageReportGroup> reportGroups;
    };

    struct PoCoverageCompositionGroup {
        std::vector<std::string> compositions;
        PoCoverageLimitSummary limits;
        std::vector<int> allRowIndexes;
        std::vector<PoCoverageRestFacilityGroup> restFacilityGroups;
    };

private:
    std::vector<AnrMaxFdpRow> _rows;
    AnrMaxFdpControl _control;
    std::vector<AnrSectorCountRow> _sectorCountRows;
    std::vector<AnrCcAugmentedMaxFdpRow> _ccAugmentedRows;
    std::vector<PoCoverageCompositionGroup> _poCoverageCompositionGroups;

    void parseDbRule(const DBRule& dbRule);
    void parseSectorCountRules(const std::vector<DBRule>& dbRules);
    void parseCcAugmentedMaxFdpRules(const std::vector<DBRule>& dbRules);
    void parseTable1Row(const DBRule& dbRule);
    void parseTable2Control(const DBRule& dbRule);
    void parseCcAugmentedTable1Row(const DBRule& dbRule);

    const AnrMaxFdpRow* findMatchingRowWithCheckInUtc(
        const Duty* duty,
        const SharedPtr<CrewDataContext>& dbData,
        int application,
        time_t checkInUtc) const;

    int findReportMinutesFrom3021(const Duty* duty,
                                  const SharedPtr<CrewDataContext>& dbData,
                                  const std::string& division) const;

    BaseRowMatchContext buildBaseRowMatchContext(const Duty* duty,
                                                 const SharedPtr<CrewDataContext>& dbData) const;

    void buildPoCoverageIndex();

    bool matchesBaseRowForTzDiff(const BaseRowMatchContext& context,
                                 int tzDiffMinutes,
                                 int sectors,
                                 const AnrMaxFdpRow& row) const;

    bool matchesCcAugmentedRow(const Duty* duty,
                               const SharedPtr<CrewDataContext>& dbData,
                               const AnrCcAugmentedMaxFdpRow& row) const;

    static int parseDurationToMinutes(const std::string& value);
    static void parseTzDiffRange(const std::string& value, int& lower, int& upper);
    static void parseFdpRange(const std::string& value, int& lower, int& upper);
    static void parseStationPattern(const std::string& value,
                                    AnrCcAugmentedMaxFdpRow::StationPattern& pattern);
    static void parseHasSectorFilter(const std::string& value,
                                     AnrCcAugmentedMaxFdpRow::StationPattern& depPattern,
                                     AnrCcAugmentedMaxFdpRow::StationPattern& arrPattern);
};

#endif // _ANR_MAX_FDP_RULE_PARAM_H_
