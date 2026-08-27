/**
 * @file AtdoAfterSlipForSQRuleParam.h
 * @brief Parameter model for rule 7422 (SQ CA ATDO after slip on return to base).
 */

#ifndef RULEENGINE_RULE7422_ATDOAFTERSLIPFORSQRULEPARAM_H_
#define RULEENGINE_RULE7422_ATDOAFTERSLIPFORSQRULEPARAM_H_

#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleParam.h"

#include "../framework/utils/LocationMatchUtils.h"

enum class Atdo7422RestStartsAfter {
    Transport,  // rest starts after debrief + transport (dropoff)
    Debrief,    // rest starts after debrief (transport counts as rest)
    DebriefNxdo // temporary: debrief-based and if exactly 00:00, align DO start to next day
};

enum class Atdo7422PairingLengthEndsAt {
    Debrief,
    Transport
};

enum class Atdo7422OperatingDefinitionType {
    SegmentIsOperating,     // Segment::getIsOperating()
    DutyIsOperating,        // equivalent to DUTY_ASSIGNMENTS=FLY|MVO
    DutyAssignmentInList    // Duty assignment matches configured list
};

enum class Atdo7422SectorRequirement {
    Any,
    Operate,
    NonOperate
};

struct Atdo7422ControlParam {
    bool standbyReducesRestAndLocalNight{true};
    Atdo7422RestStartsAfter restStartsAfter{Atdo7422RestStartsAfter::Transport};
    Atdo7422PairingLengthEndsAt pairingLengthEndsAt{Atdo7422PairingLengthEndsAt::Debrief};
    std::vector<std::string> standbyAssignmentsUpper{"SBY"};
    Atdo7422OperatingDefinitionType operatingDefinitionType{Atdo7422OperatingDefinitionType::SegmentIsOperating};
    std::vector<std::string> operatingAssignmentsUpper{"FLY", "MVO"};

    // Pairing service type filter: '*' (any), 'J' (passenger), 'F' (freighter).
    std::string serviceTypeUpper{"*"};

    // Pairing fleet filter: empty (any), otherwise require every operating segment fleet to be in this list.
    std::vector<std::string> fleetCodesUpper{};
};

using Atdo7422LocationExpr = LocationMatchUtils::LocationExpr;

class AtdoAfterSlipForSQRuleParam : public RuleParam {
public:
    explicit AtdoAfterSlipForSQRuleParam(const Rule* rule) : RuleParam(rule) {}

    void ParseParam(const DBRule& dbRule);

    const std::string& GetClause() const { return _clause; }
    const std::string& GetPatternRaw() const { return _patternRaw; }
    const std::vector<Atdo7422LocationExpr>& GetPatternStationChain() const { return _patternStationChain; }
    const std::string& GetSlipStationRaw() const { return _slipStationRaw; }
    const Atdo7422LocationExpr& GetSlipStationExpr() const { return _slipStationExpr; }

    int GetSlipLtHours() const { return _slipLtHours; }
    Atdo7422SectorRequirement GetSlipArrIsOperatingRequirement() const { return _slipArrIsOperatingRequirement; }
    Atdo7422SectorRequirement GetSlipDepIsOperatingRequirement() const { return _slipDepIsOperatingRequirement; }
    int GetMaxPairingDays() const { return _maxPairingDays; }  // 0 means unconstrained

    int GetAtdoDays() const { return _atdoDays; }
    int GetAtdoHours() const { return _atdoHours; }
    int GetAtdoLocalNights() const { return _atdoLocalNights; }
    int GetFollowingDoAllowAfterMinutes() const { return _followingDoAllowAfterMinutes; }

    bool IsValid() const;

private:
    static std::string NormalizeUpper(const std::string& value);
    static int ParseIntOrDefault(const std::string& value, int defaultValue);
    static int ParseTimeMinutes(const std::string& value);
    static std::vector<std::string> SplitDashOutsideParen(const std::string& value);

    static Atdo7422SectorRequirement ParseSectorRequirement(const std::string& valueUpper);

    std::string _clause{};
    std::string _patternRaw{};
    std::vector<std::string> _patternStationChainRaw{};
    std::vector<Atdo7422LocationExpr> _patternStationChain{};
    std::string _slipStationRaw{};
    Atdo7422LocationExpr _slipStationExpr{};

    int _slipLtHours{0};
    Atdo7422SectorRequirement _slipArrIsOperatingRequirement{Atdo7422SectorRequirement::Operate};
    Atdo7422SectorRequirement _slipDepIsOperatingRequirement{Atdo7422SectorRequirement::Operate};
    int _maxPairingDays{0};  // 0 means unconstrained

    int _atdoDays{0};
    int _atdoHours{0};
    int _atdoLocalNights{0};
    int _followingDoAllowAfterMinutes{0};
};

#endif  // RULEENGINE_RULE7422_ATDOAFTERSLIPFORSQRULEPARAM_H_
