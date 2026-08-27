/**
 * @file SingleDailyCheckinForCARSRuleParam.h
 * @brief Parameter model for rule 7506 (single daily check-in — derived from rule 8048).
 */

#ifndef RULEENGINE_RULE7506_SINGLEDAILYCHECKINFORCARSRULEPARAM_H_
#define RULEENGINE_RULE7506_SINGLEDAILYCHECKINFORCARSRULEPARAM_H_

#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleParam.h"
#include "RuleSystemDefine.h"
#include "violationcollector/ViolationTypeDefine.h"

class SingleDailyCheckinForCARSRule;

class SingleDailyCheckinForCARSRuleParam : public RuleParam {
    friend class SingleDailyCheckinForCARSRule;

private:
    explicit SingleDailyCheckinForCARSRuleParam(const Rule* rule) : RuleParam(rule) {}

    constexpr static unsigned int RuleFuncId = 7506;

    void ParseParam(const DBRule& dbRule);

    bool MatchCrewQualification(const SharedPtr<CREW>& crew,
                                const time_t& checkedStartTime,
                                const time_t& checkedEndTime) const;

    std::string _rBase{"*"};
    std::string _rRank{"*"};
    std::string _rFleet{"*"};
    std::string _rTeam{"*"};
    std::string _checkedGroupsRaw;
    std::vector<std::string> _checkedGroups;
};

#endif  // RULEENGINE_RULE7506_SINGLEDAILYCHECKINFORCARSRULEPARAM_H_
