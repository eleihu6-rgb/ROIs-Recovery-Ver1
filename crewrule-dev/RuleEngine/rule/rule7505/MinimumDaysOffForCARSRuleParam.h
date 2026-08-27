/**
 * @file MinimumDaysOffForCARSRuleParam.h
 * @brief Parameter model for rule 7505 (minimum days off — same behavior as rule 8023).
 */

#ifndef RULEENGINE_RULE7505_MINIMUMDAYSOFFFORCARSRULEPARAM_H_
#define RULEENGINE_RULE7505_MINIMUMDAYSOFFFORCARSRULEPARAM_H_

#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleParam.h"
#include "RuleSystemDefine.h"
#include "violationcollector/ViolationTypeDefine.h"

class MinimumDaysOffForCARSRule;

class MinimumDaysOffForCARSRuleParam : public RuleParam {
    friend class MinimumDaysOffForCARSRule;

private:
    explicit MinimumDaysOffForCARSRuleParam(const Rule* rule) : RuleParam(rule) {}

    constexpr static unsigned int RuleFuncId = 7505;

    void ParseParam(const DBRule& dbRule);

    bool MatchCrewQualification(const SharedPtr<CREW>& crew,
                                const time_t& checkedStartTime,
                                const time_t& checkedEndTime) const;

    std::string _rBase{"*"};
    std::string _rRank{"*"};
    std::string _rFleet{"*"};
    std::string _rTeam{"*"};
    std::string _rGroup;
    std::string _rMinDO{"1"};
    std::string _rPeriod{"1"};
    std::string _rUnit{"CM"};
    std::string _rMonthNumber{"*"};
    std::string _rLayoverTimemode;
    std::string _rRefDate;
    std::string _rRPDaysRange{"*"};
    bool _rPostRest{false};
    bool _rCountBlankDay{false};
    bool _rCountLayover{false};
    bool _rIsRolling{true};
    std::string _rCheckType{"*"};
    std::string _rLastRosterLatestEndTime{"*"};
    std::vector<std::string> _rLastRosterAssignments;

    // LEAVE ASSIGNMENTS: read like BASES — raw DB value, pipe-separated list applied when counting.
    std::string _leaveAssignments{"*"};
    // LEAVE DAYS RANGE: raw "lower-upper" like RP DAYS RANGE; when two parts, only windows whose counted leave
    // days fall in [lower, upper] are checked for MIN DO.
    std::string _leaveDaysRange{"*"};
};

#endif  // RULEENGINE_RULE7505_MINIMUMDAYSOFFFORCARSRULEPARAM_H_
