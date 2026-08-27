/**
 * @file LimitCourseRoleQualForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LIMITCOURSEROLEQUALFOREVAFDRULE_H_
#define _LIMITCOURSEROLEQUALFOREVAFDRULE_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitCourseRoleQualForEvaFdRuleParam.h"


struct RosterProgramCourse;


class LimitCourseRoleQualForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7234;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit LimitCourseRoleQualForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitCourseRoleQualForEvaFdRule::RuleFuncId, LimitCourseRoleQualForEvaFdRule::AvailableInterface) {
        ParseParam(input);
    }
    ~LimitCourseRoleQualForEvaFdRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    std::vector<LimitCourseRoleQualForEvaFdRuleParam> _ruleParams;

    bool CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const;

    //检查训练课程角色资质限制
    bool CheckCourseRoleQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const std::shared_ptr<TmProgramCourse>& currProgramCourse) const;

    void ParseParam(const InputType& input);

    void ThrowRuleViolationForRoleQualification(const ROSTER* roster) const;

    void ThrowRuleViolationForCourseRoleQualification(const ROSTER* roster) const;

private:

    //个性化检查计划训练课程伙伴Role(IP、CK等)的base/rank/fleet/team/qual/activing rank 限制
    bool CheckCourseRoleQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& crewQuals, const std::shared_ptr<TmProgramCourseRole>& tmProgramCourseRole, const long long fltId) const;

    //检查训练课程其他角色资质限制
    bool CheckCourseRoleQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& crewQuals, const string& crewRole, const long long courseId, const long long fltId) const;

    bool CheckCourseRoleQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& crewQuals, const std::shared_ptr<TmCourseRoleBase>& tmCourseRoleBase, const long long fltId) const;

    bool CheckCourseRoleQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& crewQuals, const string& crewRole, const std::shared_ptr<TmCourseRoleQual>& tmCourseRoleQual) const;
};


#endif //_LIMITCOURSEROLEQUALFOREVAFDRULE_H_
