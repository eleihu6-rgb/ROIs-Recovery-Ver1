/**
 * @file BuddiesInSameCourseForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _BUDDIESINSAMECOURSEFOREVAFDRULE_H_
#define _BUDDIESINSAMECOURSEFOREVAFDRULE_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "BuddiesInSameCourseForEvaFdRuleParam.h"



class BuddiesInSameCourseForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7254;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit BuddiesInSameCourseForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, BuddiesInSameCourseForEvaFdRule::RuleFuncId, BuddiesInSameCourseForEvaFdRule::AvailableInterface) {
        ParseParam(input);
    }
    ~BuddiesInSameCourseForEvaFdRule() override = default;

    bool CheckRule(const std::shared_ptr<CREW>& crew) const override;

private:

    std::vector<BuddiesInSameCourseForEvaFdRuleParam> _ruleParams;

    //courseBuddyCrewIdMap: 当前program下的course对应的buddy列表。map<courseId, buddy的crewId列表>
    bool CheckRule(const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const map<long long, set<string>>& courseBuddyCrewIdMap, const std::shared_ptr<CREW>& crew) const;

    void ParseParam(const InputType& input);

    void ThrowRuleViolation(const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const set<string>& missBuddyCrewIds) const;

    //输出Buddy的告警（类似COF)，告警信息挂着Buddy Crew上
    void ThrowRuleViolationForBuddy(const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const set<string>& missBuddyCrewIds) const;

};


#endif //_BUDDIESINSAMECOURSEFOREVAFDRULE_H_
