/**
 * @file LimitCourseDeviceTypeForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LIMITCOURSEDEVICETYPEFOREVAFDRULE_H_
#define _LIMITCOURSEDEVICETYPEFOREVAFDRULE_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitCourseDeviceTypeForEvaFdRuleParam.h"


struct RosterProgramCourse;


class LimitCourseDeviceTypeForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7239;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit LimitCourseDeviceTypeForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitCourseDeviceTypeForEvaFdRule::RuleFuncId, LimitCourseDeviceTypeForEvaFdRule::AvailableInterface) {
        ParseParam(input);
    }
    ~LimitCourseDeviceTypeForEvaFdRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    std::vector<LimitCourseDeviceTypeForEvaFdRuleParam> _ruleParams;

    //检查训练课程设备（Device）限制
    bool CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const;

    void ParseParam(const InputType& input);

    void ThrowRuleViolationForCourseDeviceType(const ROSTER* roster) const;

private:
    bool MatchCourseRoleBase(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& crewQuals, const std::shared_ptr<TmCourseRoleBase>& tmCourseRoleBase) const;

    bool MatchCourseRoleQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& crewQuals, const vector<std::shared_ptr<TmCourseRoleQual>>& tmCourseRoleQualList) const;
    bool MatchCourseRoleQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& crewQuals, const std::shared_ptr<TmCourseRoleQual>& tmCourseRoleQual) const;

    /*
    * 检查计划训练课程设备类型（Device）限制
    * @param programCourseDevice: 课程使用的设备
    */
    bool CheckCourseDeviceType(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& crewQuals, const std::shared_ptr<TmDevice>& programCourseDevice, const std::shared_ptr<TmProgramCourse>& programCourse) const;

};


#endif //_LIMITCOURSEDEVICETYPEFOREVAFDRULE_H_
