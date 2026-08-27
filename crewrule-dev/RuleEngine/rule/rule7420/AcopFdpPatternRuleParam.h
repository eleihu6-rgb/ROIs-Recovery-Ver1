/**
 * @file AcopFdpPatternRuleParam.h
 * @brief Parameters for rule 7420 (SQ CA ACOP FDP pattern, Table A).
 */
#ifndef _ACOP_FDP_PATTERN_RULE_PARAM_H_
#define _ACOP_FDP_PATTERN_RULE_PARAM_H_

#include <string>

#include "CrewDB.h"
#include "RuleParam.h"

#include "../framework/utils/LocationMatchUtils.h"

class AcopFdpPatternRuleParam : public RuleParam {
public:
    explicit AcopFdpPatternRuleParam(const Rule* rule) : RuleParam(rule) {}

    void ParseParam(const DBRule& dbRule);
    void ParseParam(const std::string& paramString);

    void SetRowNum(int rowNum) { _rowNum = rowNum; }
    int GetRowNum() const { return _rowNum; }

    const std::string& GetClause() const { return _clause; }
    const std::string& GetFlightDepRaw() const { return _flightDepRaw; }
    const std::string& GetFlightArrRaw() const { return _flightArrRaw; }
    const std::string& GetReportTimeRaw() const { return _reportTimeRaw; }
    int GetMaxOperatingSectors() const { return _maxOperatingSectors; }
    bool IsDeadheadAllowed() const { return _deadheadAllowed; }
    int GetNextDutyDayOffset() const { return _nextDutyDayOffset; }
    const std::string& GetForbiddenNextPatternRaw() const { return _forbiddenNextDutyPatternRaw; }
    const std::string& GetAppliesAtSlipStationRaw() const { return _appliesAtSlipStationRaw; }

    bool MatchesTriggerDuty(const Duty& duty, const CrewDataContext* dbData) const;
    bool HasNextDutyStartOffsetRestriction() const;
    bool HasForbiddenNextDutyPatternRestriction() const;
    bool MatchesSlipStation(const std::string& slipStation, const CrewDataContext* dbData) const;
    bool IsForbiddenNextPattern(const Pairing& pairing, std::size_t startDutyIndex) const;
    bool EvaluateForbiddenNextPattern(const Pairing& pairing,
                                      std::size_t startDutyIndex,
                                      int& operatingLegsToTargetOut,
                                      std::string& targetStationOut) const;

private:
    struct ReportTimeWindow {
        bool allowAny{true};
        int startMinutes{0};  // minutes of day [0,1439]
        int endMinutes{0};    // minutes of day [0,1439]

        bool Matches(const time_t reportTimeLoc) const;
    };

    struct ForbiddenNextDutyPattern {
        enum class Type {
            None,
            OperatingLegsToStationAtLeast,
            Unknown
        };

        Type type{Type::None};
        std::string targetStation{};
        int threshold{0};

        bool IsForbidden(const Pairing& pairing, std::size_t startDutyIndex) const;
        bool EvaluateForbidden(const Pairing& pairing,
                               std::size_t startDutyIndex,
                               int& operatingLegsToTargetOut) const;
    };

    static std::string NormalizeRangeSeparators(std::string value);
    static int ParseTimeMinutes(const std::string& value);
    static bool ParseBool(const std::string& value, bool defaultValue);
    static int ParseInt(const std::string& value, int defaultValue);

    void ParseFlightDep(const std::string& value);
    void ParseFlightArr(const std::string& value);
    void ParseReportTimeWindow(const std::string& value);
    void ParseMaxOperatingSectors(const std::string& value);
    void ParseDeadheadAllowed(const std::string& value);
    void ParseNextDutyDayOffset(const std::string& value);
    void ParseForbiddenNextDutyPattern(const std::string& value);
    void ParseAppliesAtSlipStation(const std::string& value);

    bool MatchesTriggerFlight(const Duty& duty, const CrewDataContext* dbData) const;

    std::string _clause{};
    int _rowNum{0};

    std::string _flightDepRaw{};
    LocationMatchUtils::LocationExpr _flightDep{};

    std::string _flightArrRaw{};
    LocationMatchUtils::LocationExpr _flightArr{};

    std::string _reportTimeRaw{};
    ReportTimeWindow _reportTimeWindow{};

    int _maxOperatingSectors{0};
    bool _deadheadAllowed{true};

    int _nextDutyDayOffset{0};

    std::string _forbiddenNextDutyPatternRaw{};
    ForbiddenNextDutyPattern _forbiddenNextDutyPattern{};

    std::string _appliesAtSlipStationRaw{};
    LocationMatchUtils::LocationExpr _appliesAtSlipStation{};
};

#endif  // _ACOP_FDP_PATTERN_RULE_PARAM_H_
