/**
 * @file MaxDutyPeriodRuleForSQParam.h
 */

#ifndef _LIMIT_MAX_DUTY_PERIOD_RULE_FORSQ_PARAM_H_
#define _LIMIT_MAX_DUTY_PERIOD_RULE_FORSQ_PARAM_H_

#include <string>
#include <vector>
#include <limits>

#include "CrewDB.h"
#include "RuleParam.h"
#include "StringUtil.h"

class MaxDutyPeriodRuleForSQParam : public RuleParam {
public:
    explicit MaxDutyPeriodRuleForSQParam(const Rule* rule) : RuleParam(rule) {}

    static constexpr unsigned int RuleFuncId =
        RULES::SQ_CA_MAX_DUTY_PERIOD_WITH_TRAILING_DEADHEAD;

    void ParseParam(const DBRule& dbRule);

    bool Matches(const std::string& fleet,
                 const std::string& composition,
                 bool hasFleetChange,
                 bool hasFleetGroupChange) const;
    bool MatchesServiceType(const std::string& dutyServiceTypeUpper) const;

    const std::vector<std::string>& GetAssignmentsAfterFDP() const { return _assignmentsAfterFDP; }
    const std::vector<std::string>& GetDutyAssignments() const { return _dutyAssignments; }
    int GetMaxDutyPeriodMinutes() const { return _maxDutyPeriodMinutes; }
    int GetMaxFlightDutyPeriodMinutes() const { return _maxFlightDutyPeriodMinutes; }

    int GetRowNum() const { return _rowNum; }
    void SetRowNum(int rowNum) { _rowNum = rowNum; }
    const std::string& GetFleetLabel() const { return _fleetLabel; }
    const std::string& GetCompositionLabel() const { return _compositionLabel; }
    const std::string& GetFleetChangeLabel() const { return _fleetChangeLabel; }
    const std::string& GetFleetGroupChangeLabel() const { return _fleetGroupChangeLabel; }
    const std::string& GetAssignmentsAfterFDPLabel() const { return _assignmentsAfterFDPLabel; }
    const std::string& GetDutyAssignmentsLabel() const { return _dutyAssignmentsLabel; }
    const std::string& GetServiceTypeLabel() const { return _serviceTypeLabel; }
    const std::string& GetFleetGroupLabel() const { return _fleetGroupLabel; }
    const std::vector<std::string>& GetFleetGroupsUpper() const { return _fleetGroupsUpper; }


private:
    std::string _serviceTypeUpper{"*"};
    std::string _serviceTypeLabel{"*"};
    std::vector<std::string> _fleetGroupsUpper;
    std::string _fleetGroupLabel{"*"};
    std::vector<std::string> _fleets;
    std::vector<std::string> _compositions;
    std::string _fleetLabel{"*"};
    std::string _compositionLabel{"*"};
    std::vector<std::string> _assignmentsAfterFDP;
    std::string _assignmentsAfterFDPLabel{"*"};
    std::vector<std::string> _dutyAssignments;
    std::string _dutyAssignmentsLabel{"*"};
    bool _checkFleetChange{false};
    bool _hasFleetChange{false};
    std::string _fleetChangeLabel{"*"};
    bool _checkFleetGroupChange{false};
    bool _hasFleetGroupChange{false};
    std::string _fleetGroupChangeLabel{"*"};
    int _maxDutyPeriodMinutes{std::numeric_limits<int>::max()};
    int _maxFlightDutyPeriodMinutes{std::numeric_limits<int>::max()};
    int _rowNum{0};

    void parseListValue(const std::string& value, std::vector<std::string>& target, std::string& label);
    void applyHeaderValue(const std::string& headerUpper, const std::string& value);
};

#endif // _LIMIT_MAX_DUTY_PERIOD_WITH_DEADHEAD_RULE_PARAM_H_
