/**
 * @file LimitCourseRoleNumbersForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LIMITCOURSEROLENUMBERSFOREVAFDRULE_H_
#define _LIMITCOURSEROLENUMBERSFOREVAFDRULE_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitCourseRoleNumbersForEvaFdRuleParam.h"


struct RosterProgramCourse;


class LimitCourseRoleNumbersForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7235;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit LimitCourseRoleNumbersForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitCourseRoleNumbersForEvaFdRule::RuleFuncId, LimitCourseRoleNumbersForEvaFdRule::AvailableInterface) {
        ParseParam(input);
    }
    ~LimitCourseRoleNumbersForEvaFdRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    enum class DeviceWarnCode {
        NO = 0, //无告警
        NOT_AVAILABLE = 1, //设备不可用告警
        TIME_OVERLAP = 2, //时间冲突告警
        NUM_OF_PEOPLE = 4, //学员数量超标告警
    };

    std::vector<LimitCourseRoleNumbersForEvaFdRuleParam> _ruleParams;

    //检查TE/IP/CK/PNR的 min、max 人数限制
    bool CheckRule(const ROSTER* roster) const;

    void ParseParam(const InputType& input);

    void ThrowRuleViolationForNumberOfPeople(const ROSTER* roster) const;

    void ThrowRuleViolationForNumberOfRoleQualPeople(const ROSTER* roster) const;
    
private:

    /*
    * 检查不同角色min、max 人数限制，角色：TE (学员)、IP（教员）、CK（检查员）、PNR（伙伴）
    * teRoster: 学员排班roster
    * role: 该学员课程需要检查的角色
    * programCourse: 学员的program course
    */
    bool CheckCourseNumberOfPeople(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& programCourse) const;

    /*
    * 通过ProgramCourseRole.roleType=OTHER_ROLE，检查IP、CK等角色在某课程需要的角色数量(ProgramCourseRole的roleNumber）
    * checkedRoles: 已经检查的角色列表
    * roster: 排班roster
    * teProgramCourse: 学员的program course
    * parentProgramCourseIds: programCourse对应的父的teProgramCourseId
    */
    bool CheckCourseNumberOfOtherRolePeopleWithProgramCourseRole(vector<string>& checkedRoles, const ROSTER* roster, const string& groupId, const vector<long long>& parentProgramCourseIds) const;

    /*
    * 通过ProgramCourseRole.roleType=IP，检查IP角色在某课程需要IP角色各资质的人员数量(ProgramCourseRoleQual的roleNumber、）
    * checkedRoles: 已经检查的角色列表
    * roster: 排班roster
    * teProgramCourse: 学员的program course
    * parentProgramCourseIds: programCourse对应的父的teProgramCourseId
    */
    bool CheckCourseNumberOfIPRoleQualPeopleWithProgramCourseRole(const ROSTER* roster, const string& groupId, const vector<long long>& parentProgramCourseIds) const;

    /*
    * 标准化配置检查不同角色min、max 人数限制
    * role: 指定检查的角色
    * groupId: 同时上课人员组ID (tm_program_course.group_id, tm_program_course_instructor.group_id)
    * courseId：课程ID (tm_course.id)
    */
    bool CheckCourseNumberOfPeopleWithCourseRole(const vector<string>& checkedRoles, const ROSTER* roster, const string& groupId, const long long& courseId) const;

};


#endif //_LIMITCOURSEROLENUMBERSFOREVAFDRULE_H_
