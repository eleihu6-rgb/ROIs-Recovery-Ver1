/**
 * @file AcopSlipPatternRuleParam.h
 * @brief Parameter model for rule 7421 (SQ CA ACOP slip pattern, Template B).
 */

#ifndef _ACOP_SLIP_PATTERN_RULE_PARAM_H_
#define _ACOP_SLIP_PATTERN_RULE_PARAM_H_

#include <string>
#include <vector>
#include <functional>

#include "CrewDB.h"
#include "RuleParam.h"

#include "../framework/utils/LocationMatchUtils.h"

enum class AcopRestStartsAfter {
    Transport,  // rest starts after debrief + transport (dropoff)
    Debrief     // rest starts after debrief (transport counts as rest)
};

enum class AcopSlipPatternExtraConditionType {
    None,
    Eur4B,  // Europe clause 4(b) (standby-dependent next-day branching)
    NineAiStandbyCrew  // Clause 9(a)(i) standby crew-composition rule (CAP/FO vs additional)
};

enum class AcopDoAfterTriggerType {
    Always,
    DayAfterArrival,
    RestLt24H
};

enum class AcopSlipOperatingRequirement {
    Any,
    Operate,
    NonOperate
};

enum class AcopSlipStationMatchMode {
    Expression,    // explicit location expression (airport/city/country/region expression)
    CityAnchor,    // '*' : same city as arrival airport into slip
    AirportAnchor  // '%' : same airport as arrival airport into slip
};

struct AcopSlipPatternControlParam {
    bool standbyReducesRestAndLocalNight{true};
    AcopRestStartsAfter restStartsAfter{AcopRestStartsAfter::Transport};
    std::vector<std::string> standbyAssignments{"SBY"};  // default, overridable from table 2

    // Optimizer gating: when running under optimizer, allow violations to be treated as "pass"
    // if the rule row severity (DBRule::severity) is <= this level.
    // -1 (default) => None (no bypass); 255 => Any (bypass all severities).
    int optimizerPassLevel{-1};

    // Pairing service type filter: '*' (any), 'J' (passenger), 'F' (freighter).
    std::string serviceTypeUpper{"*"};

    // Pairing fleet filter: '*' (any) or '|' separated fleet codes. Applies to operating segments only.
    // A pairing matches if all operating segments have fleet codes within this set.
    std::vector<std::string> fleetCodesUpper{};  // empty => any

    // Default: duty assignment in {"FLY","MVO"}.
    // Optional: can be overridden via Table 2 "OPERATING DEFINITION" similar to rule 7422.
    enum class OperatingDefinitionType {
        DutyIsOperating,        // equivalent to DUTY_ASSIGNMENTS=FLY|MVO
        DutyAssignmentInList,   // Duty assignment matches configured list
        SegmentIsOperating      // Segment::getIsOperating() on boundary segment into/out of slip station
    };
    OperatingDefinitionType operatingDefinitionType{OperatingDefinitionType::DutyIsOperating};
    std::vector<std::string> operatingAssignmentsUpper{"FLY", "MVO"};
};

// Location expression syntax (reusable across rules): supports '|', '~', and parentheses, e.g. "(AU~PER)|NZ".
using AcopLocationExpr = LocationMatchUtils::LocationExpr;

struct AcopCopPattern {
    enum class SpecialType {
        None,
        InSingleFdpSequence,
        DutyHasOperatingSectorAndEndsAfter
    };

    SpecialType special{SpecialType::None};

    // Raw tokens (uppercased/trimmed) for stationChain, used for special wildcard semantics in matching.
    // Size should match stationChain when special==None.
    std::vector<std::string> stationChainRawUpper{};

    // For SpecialType::None: expected station chain tokens (dep + each duty arrival) to match.
    std::vector<AcopLocationExpr> stationChain{};

    // For SpecialType::InSingleFdpSequence: e.g. SIN-ADL-MEL in single FDP.
    std::vector<std::string> singleFdpSequence{};

    // For SpecialType::DutyHasOperatingSectorAndEndsAfter: e.g. SIN-PER flight.
    std::string operatingDep{};
    std::string operatingArr{};
};

struct AcopAllowedDutyWithinSlipConstraint {
    enum class Type {
        Pos,          // positioning (MVP)
        PosInLocation, // positioning within location expr (MVP, all segs within location)
        FdpMaxDuration,  // flying duty period <= N (minutes), optionally in location
        DutyInPaths,  // operating duty matches one of the allowed station paths
        DutyInLocation // any duty contained within location expr
    };

    Type type{Type::Pos};
    int maxDurationMinutes{0};  // for Type::PosInLocation / Type::FdpMaxDuration (0 means unconstrained)
    std::vector<std::vector<std::string>> allowedPaths{};  // for Type::DutyInPaths
    AcopLocationExpr location{};  // for Type::PosInLocation / Type::FdpMaxDuration / Type::DutyInLocation
};

struct AcopAllowedDutyWithinSlip {
    // Empty constraints means unconstrained ('*' / don't care).
    bool disallowAll{false};  // true => no internal non-standby duty is allowed
    std::vector<AcopAllowedDutyWithinSlipConstraint> anyOf{};

    bool HasConstraint() const { return disallowAll || !anyOf.empty(); }
    bool IsNonStandbyDutyAllowed(const Duty& duty, const CrewDataContext* dbData) const;
};

class AcopSlipPatternRuleParam : public RuleParam {
public:
    explicit AcopSlipPatternRuleParam(const Rule* rule) : RuleParam(rule) {}

    void ParseParam(const DBRule& dbRule);

    void SetRowNum(int rowNum) { _rowNum = rowNum; }
    int GetRowNum() const { return _rowNum; }

    const std::string& GetClause() const { return _clause; }

    const std::string& GetGroup() const { return _group; }

    // "Pattern" is the canonical name (previously "COP / Applicability").
    const std::string& GetCopApplicabilityRaw() const { return _copApplicabilityRaw; }
    const AcopCopPattern& GetCopPattern() const { return _copPattern; }

    const std::string& GetSlipStationRaw() const { return _slipStationRaw; }
    const AcopLocationExpr& GetSlipStation() const { return _slipStation; }
    AcopSlipStationMatchMode GetSlipStationMatchMode() const { return _slipStationMatchMode; }
    int GetSlipOccurrence() const { return _slipOccurrence; }

    int GetPriority() const { return _priority; }

    const std::string& GetDutyBeforeRaw() const { return _dutyBeforeRaw; }
    const std::string& GetDutyAfterRaw() const { return _dutyAfterRaw; }
    bool MatchesDutyBefore(const Duty& duty,
                           const std::function<bool(const Duty&)>& isUlrEquivalentPositioningDuty) const;
    bool MatchesDutyAfter(const Duty& duty,
                          const std::function<bool(const Duty&)>& isUlrEquivalentPositioningDuty) const;

    AcopSlipOperatingRequirement GetSlipArrIsOperatingRequirement() const { return _slipArrIsOperatingRequirement; }
    AcopSlipOperatingRequirement GetSlipDepIsOperatingRequirement() const { return _slipDepIsOperatingRequirement; }
    bool MatchesSlipArrFlightNo(const Duty& arriveDuty, const CrewDataContext* dbData) const;
    bool MatchesSlipDepFlightNo(const Duty& departDuty, const CrewDataContext* dbData) const;

    const std::string& GetReportTimeRaw() const { return _reportTimeRaw; }
    bool MatchesReportTimeAtBase(time_t reportTimeLoc) const;
    const std::string& GetDepartureTimeAtBaseRaw() const { return _departureTimeAtBaseRaw; }
    bool MatchesDepartureTimeAtBase(time_t departTimeLoc) const;

    int GetPrevSlipLocalNightsThreshold() const { return _prevSlipLocalNightsThreshold; } // >= threshold
    int GetPrevSlipHadStandbyFilter() const { return _prevSlipHadStandbyFilter; } // -1=* (ignore), 0=require none, 1=require >=1

    int GetMinSlipMinutes() const { return _minSlipMinutes; } // -1 or 0 means unconstrained
    int GetMinSlipLocalNights() const { return _minSlipLocalNights; } // 0 means unconstrained

    int GetMaxSlipMinutes() const { return _maxSlipMinutes; } // -1 or 0 means unconstrained (based on slip window minutes)

    const std::string& GetSlipDepartDutyReportTimeRaw() const { return _slipDepartDutyReportTimeRaw; }
    int GetSlipDepartDutyReportTimeMinutes() const { return _slipDepartDutyReportTimeMinutes; } // -1 means unconstrained

    int GetDutyAfterMinutes() const { return _dutyAfterMinutes; } // -1 means unconstrained
    int GetDutyAfterLocalNights() const { return _dutyAfterLocalNights; } // -1 means unconstrained
    int GetDutyAfterLocalTimeMinutes() const { return _dutyAfterLocalTimeMinutes; } // -1 means unconstrained, 0 means "00:00"

    int GetMaxStandbyPeriods() const { return _maxStandbyPeriods; } // -1 means unconstrained
    int GetMaxStandbyMinutes() const { return _maxStandbyMinutes; } // -1 means unconstrained (total standby minutes within the slip)

    const std::string& GetAllowedDutyWithinSlipRaw() const { return _allowedDutyWithinSlipRaw; }
    const AcopAllowedDutyWithinSlip& GetAllowedDutyWithinSlip() const { return _allowedDutyWithinSlip; }
    int GetDoAfterDutyDays() const { return _doAfterDutyDays; }
    const std::string& GetDoAfterDutyRaw() const { return _doAfterDutyRaw; }
    const std::vector<std::string>& GetDoAfterDutyAfterAssignmentsUpper() const { return _doAfterDutyAfterAssignmentsUpper; }
    bool HasDoAfterDutyAfterAssignments() const { return !_doAfterDutyAfterAssignmentsUpper.empty(); }
    const std::string& GetExtraConditionRaw() const { return _extraConditionRaw; }
    AcopSlipPatternExtraConditionType GetExtraConditionType() const { return _extraConditionType; }
    AcopDoAfterTriggerType GetDoAfterTriggerType() const { return _doAfterTriggerType; }
    const std::string& GetDoAfterTriggerRaw() const { return _doAfterTriggerRaw; }
    int GetAtdoDaysOffAtBase() const { return _atdoDaysOffAtBase; }
    int GetExdoDaysOffAtBase() const { return _exdoDaysOffAtBase; }
    bool HasAtdoDaysOffAtBase() const { return _atdoDaysOffAtBase > 0; }
    bool HasExdoDaysOffAtBase() const { return _exdoDaysOffAtBase > 0; }
    bool HasAnyExtraCondition() const {
        return _extraConditionType != AcopSlipPatternExtraConditionType::None ||
               _doAfterTriggerType != AcopDoAfterTriggerType::Always ||
               HasAtdoDaysOffAtBase() ||
               HasExdoDaysOffAtBase();
    }

private:
    struct SlipFlightNoToken;

    struct ReportTimeWindow {
        bool allowAny{true};
        int startMinutes{0};  // minutes of day [0,1439]
        int endMinutes{0};    // minutes of day [0,1439]

        bool Matches(time_t reportTimeLoc) const;
    };

    static std::string NormalizeDashes(std::string value);
    static std::string NormalizeUpper(const std::string& value);
    static int ParseTimeMinutes(const std::string& value);
    static int ParseDurationMinutesOrUnconstrained(const std::string& value, int unconstrainedValue);
    static int ParseIntOrDefault(const std::string& value, int defaultValue);
    static int ParseIntOrUnconstrained(const std::string& value, int unconstrainedValue);

    void ParseCopApplicability(const std::string& value);
    void ParseSlipStation(const std::string& value);
    void ParseGroup(const std::string& value);
    void ParsePriority(const std::string& value);
    void ParseDutyBefore(const std::string& value);
    void ParseDutyAfter(const std::string& value);
    void ParseSlipArrIsOperating(const std::string& value);
    void ParseSlipDepIsOperating(const std::string& value);
    void ParseSlipArrFlightNo(const std::string& value);
    void ParseSlipDepFlightNo(const std::string& value);
    void ParseSlipFlightNoValue(const std::string& value,
                                std::string& rawValue,
                                std::vector<SlipFlightNoToken>& tokens,
                                const char* boundaryLabel);
    void ParseReportTimeWindow(const std::string& value);
    void ParseDepartureTimeAtBaseWindow(const std::string& value);
    void ParsePrevSlipLocalNights(const std::string& value);
    void ParsePrevSlipHadStandby(const std::string& value);
    void ParseMinSlipHours(const std::string& value);
    void ParseMinSlipLocalNights(const std::string& value);
    void ParseMaxSlipHours(const std::string& value);
    void ParseSlipDepartDutyReportTime(const std::string& value);
    void ParseDutyAfterHours(const std::string& value);
    void ParseDutyAfterLocalNights(const std::string& value);
    void ParseDutyAfterLocalTime(const std::string& value);
    void ParseMaxStandbyPeriods(const std::string& value);
    void ParseMaxStandbyHours(const std::string& value);
    void ParseAllowedDutyWithinSlip(const std::string& value);
    void ParseDoAfterDuty(const std::string& value);
    void ParseExtraCondition(const std::string& value);

    static std::vector<std::string> SplitPipeList(const std::string& value);
    static std::vector<std::string> SplitDashOutsideParen(const std::string& value);
    static std::vector<std::string> SplitSemicolonList(const std::string& value);

    std::string _clause{};
    int _rowNum{0};

    std::string _group{"DEFAULT"};

    std::string _copApplicabilityRaw{};
    AcopCopPattern _copPattern{};

    std::string _slipStationRaw{};
    AcopLocationExpr _slipStation{};
    AcopSlipStationMatchMode _slipStationMatchMode{AcopSlipStationMatchMode::CityAnchor};
    int _slipOccurrence{0}; // 0 means "any occurrence"

    int _priority{0};

    std::string _dutyBeforeRaw{};
    std::vector<std::string> _dutyBefore{};

    std::string _dutyAfterRaw{};
    std::vector<std::string> _dutyAfter{};

    struct SlipFlightNoToken {
        bool hasAirline{false};
        std::string airlineUpper{};
        std::string flightNumberUpper{};
    };
    std::string _slipArrFlightNoRaw{};
    std::vector<SlipFlightNoToken> _slipArrFlightNoTokens{};
    std::string _slipDepFlightNoRaw{};
    std::vector<SlipFlightNoToken> _slipDepFlightNoTokens{};

    AcopSlipOperatingRequirement _slipArrIsOperatingRequirement{AcopSlipOperatingRequirement::Any};
    AcopSlipOperatingRequirement _slipDepIsOperatingRequirement{AcopSlipOperatingRequirement::Any};

    std::string _reportTimeRaw{};
    ReportTimeWindow _reportTimeWindow{};
    std::string _departureTimeAtBaseRaw{};
    ReportTimeWindow _departureTimeAtBaseWindow{};

    int _prevSlipLocalNightsThreshold{0};
    int _prevSlipHadStandbyFilter{-1};

    int _minSlipMinutes{-1};
    int _minSlipLocalNights{0};
    int _maxSlipMinutes{-1};

    std::string _slipDepartDutyReportTimeRaw{};
    int _slipDepartDutyReportTimeMinutes{-1};

    int _dutyAfterMinutes{-1};
    int _dutyAfterLocalNights{-1};
    int _dutyAfterLocalTimeMinutes{-1};

    int _maxStandbyPeriods{-1};
    int _maxStandbyMinutes{-1};

    std::string _allowedDutyWithinSlipRaw{};
    AcopAllowedDutyWithinSlip _allowedDutyWithinSlip{};
    int _doAfterDutyDays{0};
    std::string _doAfterDutyRaw{};
    std::vector<std::string> _doAfterDutyAfterAssignmentsUpper{};
    std::string _extraConditionRaw{};
    AcopSlipPatternExtraConditionType _extraConditionType{AcopSlipPatternExtraConditionType::None};
    AcopDoAfterTriggerType _doAfterTriggerType{AcopDoAfterTriggerType::Always};
    std::string _doAfterTriggerRaw{};
    int _atdoDaysOffAtBase{0};
    int _exdoDaysOffAtBase{0};

};

#endif  // _ACOP_SLIP_PATTERN_RULE_PARAM_H_
