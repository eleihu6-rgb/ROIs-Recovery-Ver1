/**
 * @file LimitCourseRoleQualAndNumbersForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LIMITCOURSEROLEQUALANDNUMBERSFOREVAFDRULE_H_
#define _LIMITCOURSEROLEQUALANDNUMBERSFOREVAFDRULE_H_

#include <string>
#include <tuple>
#include <unordered_set>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitCourseRoleQualAndNumbersForEvaFdRuleParam.h"


struct RosterProgramCourse;

class LimitCourseRoleQualAndNumbersForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7251;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit LimitCourseRoleQualAndNumbersForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitCourseRoleQualAndNumbersForEvaFdRule::RuleFuncId, LimitCourseRoleQualAndNumbersForEvaFdRule::AvailableInterface) {
        ParseParam(input);
    }
    ~LimitCourseRoleQualAndNumbersForEvaFdRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    struct WarnInfo {
        std::unordered_set<string> baseWarnTypes;
        std::unordered_set<string> baseWarnCrewIds;
    };

    std::vector<LimitCourseRoleQualAndNumbersForEvaFdRuleParam> _ruleParams;

    //检查TE/IP/CK/PNR的 min、max 人数限制
    bool CheckRule(const ROSTER* roster) const;

    void ParseParam(const InputType& input);

    void ThrowRuleViolationForNumberOfPeople(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& programCourse) const;

    void ThrowRuleViolationForRoleQualPeople(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& programCourse) const;

    void ThrowRuleViolationForNumberOfRoleQualPeople(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& programCourse) const;

    void ThrowRuleViolationForBase(const WarnInfo& warnInfo, const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& programCourse) const;
    
private:
    enum class WarnCode {
        NO_WARN = 0, //无告警
        ROLE_NUMBER_WARN = 1, //角色人员数量不满足告警
        QUAL_WARN = 2, //角色资质不满足告警,
        QUAL_NUMBER_WARN = 4, //角色资质不满足告警,
        BASE_WARN = 8, //角色Bases、Fleet等基本配置不满足告警
    };

    /*
    * 检查不同角色min、max 人数限制，角色：TE (学员)、IP（教员）、CK（检查员）、PNR（伙伴）
    * roster: 学员排班roster
    * programCourse: 学员的program course
    * instructorRoster: 教员的roster
    */
    bool CheckRule(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& checkedProgramCourse, const ROSTER* instructorRoster) const;

    /*
    * 通过ProgramCourseRole.roleType=OTHER_ROLE，检查IP、CK等角色在某课程需要的角色数量(ProgramCourseRole的roleNumber）
    * checkedRoles: 已经检查的角色列表
    * roster: 排班roster
    * teProgramCourse: 学员的program course
    * parentProgramCourseIds: programCourse对应的父的teProgramCourseId
    */
    bool CheckRuleWithProgramCourseRole(set<string>& checkedRoles, const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& checkedProgramCourse, const vector<long long>& parentProgramCourseIds, const ROSTER* instructorRoster) const;
    bool CheckRuleWithProgramCourseRole(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& checkedProgramCourse, const string& role, const vector<std::shared_ptr<TmProgramCourseRole>>& tmProgramCourseRoleList, const ROSTER* instructorRoster) const;

    bool CheckRoleNumberWithProgramCourseRole(const ROSTER* roster, const string& role, const std::shared_ptr<TmProgramCourseRole>& tmProgramCourseRole, const std::shared_ptr<TmProgramCourse>& checkedProgramCourse, const ROSTER* instructorRoster) const;
    bool CheckBaseWithProgramCourseRole(WarnInfo& warnInfo, const ROSTER* roster, const string& role, const std::shared_ptr<TmProgramCourseRole>& tmProgramCourseRole, const std::shared_ptr<TmProgramCourse>& checkedProgramCourse, const ROSTER* instructorRoster) const;
    bool CheckBaseWithProgramCourseRole(WarnInfo& warnInfo, const ROSTER* roster, const std::shared_ptr<TmProgramCourseRole>& tmProgramCourseRole, const vector<std::shared_ptr<TmProgramCourse>>& programCourseList, const ROSTER* instructorRoster) const;
    bool CheckBaseWithProgramCourseRole(WarnInfo& warnInfo, const ROSTER* roster, const std::shared_ptr<TmProgramCourseRole>& tmProgramCourseRole, const vector<std::shared_ptr<TmProgramCourseInstructor>>& programCourseInstructorList, const ROSTER* instructorRoster) const;

    /*
    * 通过ProgramCourseIpRole检查IP角色在某课程需要的角色数量(ProgramCourseIpRoleQual的roleNumber）
    * checkedRoles: 已经检查的角色列表
    * roster: 排班roster
    * teProgramCourse: 学员的program course
    * parentProgramCourseIds: programCourse对应的父的teProgramCourseId
    */
    bool CheckRuleWithProgramCourseIpRole(set<string>& checkedRoles, const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& checkedProgramCourse, const vector<long long>& parentProgramCourseIds, const ROSTER* instructorRoster) const;
    bool CheckRuleWithProgramCourseIpRole(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& checkedProgramCourse, const vector<std::shared_ptr<TmProgramCourseIpRole>>& tmProgramCourseIpRoleList, const ROSTER* instructorRoster) const;
    bool CheckRuleWithProgramCourseIpRole(WarnCode& warnCode, WarnInfo& warnInfo, const ROSTER* roster, const std::shared_ptr<TmProgramCourseIpRole>& tmProgramCourseIpRole, const vector<std::shared_ptr<TmProgramCourseIpRoleBase>>& tmProgramCourseIpRoleBaseList, const string& groupId, const vector<std::shared_ptr<TmProgramCourseInstructor>>& tmProgramCourseInstructorList, const ROSTER* instructorRoster) const;

    //检查IP角色人员数量是否满足，告警信息为人员数量不满足
    bool CheckRoleNumberWithProgramCourseIpRole(const ROSTER* roster, const std::shared_ptr<TmProgramCourseIpRole>& tmProgramCourseIpRole, const std::shared_ptr<TmProgramCourseIpRoleBase>& tmProgramCourseIpRoleBase, const vector<std::shared_ptr<TmProgramCourseInstructor>>& programCourseInstructorList, const ROSTER* instructorRoster) const;
    //检查IP角色资质和人员（一起检查）数量满足，告警信息为资质不满足
    //bool CheckQualNumberWithProgramCourseIpRole(const ROSTER* roster, const std::shared_ptr<TmProgramCourseIpRole>& tmProgramCourseIpRole, const string& groupId, const ROSTER* instructorRoster) const;
    bool CheckQualNumberWithProgramCourseIpRole(const ROSTER* roster, const std::shared_ptr<TmProgramCourseIpRole>& tmProgramCourseIpRole, const std::shared_ptr<TmProgramCourseIpRoleBase>& tmProgramCourseIpRoleBase, const vector<std::shared_ptr<TmProgramCourseInstructor>>& programCourseInstructorList, const ROSTER* instructorRoster) const;
    //bool CheckBaseWithProgramCourseIpRole(const ROSTER* roster, const std::shared_ptr<TmProgramCourseIpRole>& tmProgramCourseIpRole, const string& groupId, const ROSTER* instructorRoster) const;
    bool CheckBaseWithProgramCourseIpRole(WarnInfo& warnInfo, const ROSTER* roster, const std::shared_ptr<TmProgramCourseIpRole>& tmProgramCourseIpRole, const std::shared_ptr<TmProgramCourseIpRoleBase>& tmProgramCourseIpRoleBase, const vector<std::shared_ptr<TmProgramCourseInstructor>>& programCourseInstructorList, const ROSTER* instructorRoster) const;
    
    /*
    * 标准化配置检查不同角色min、max 人数限制
    * role: 指定检查的角色
    * groupId: 同时上课人员组ID (tm_program_course.group_id, tm_program_course_instructor.group_id)
    * courseId：课程ID (tm_course.id)
    */
    bool CheckRuleWithCourseRole(set<string>& checkedRoles, const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& checkedProgramCourse, const ROSTER* instructorRoster) const;
    bool CheckRuleWithCourseRole(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& checkedProgramCourse, const vector<std::shared_ptr<TmCourseRoleBase>>& tmCourseRoleBaseList, const vector<std::shared_ptr<TmProgramCourse>>& programCourseList, const ROSTER* instructorRoster) const;
    bool CheckRuleWithCourseRole(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& checkedProgramCourse, const vector<std::shared_ptr<TmCourseRoleBase>>& tmCourseRoleBaseList, const vector<std::shared_ptr<TmProgramCourseInstructor>>& programCourseInstructorList, const ROSTER* instructorRoster) const;

    bool CheckQualNumberWithCourseRole(const ROSTER* roster, const std::shared_ptr<TmCourseRoleBase>& tmCourseRoleBase, const vector<std::shared_ptr<TmProgramCourseInstructor>>& programCourseInstructorList, const ROSTER* instructorRoster) const;
    bool CheckBaseWithCourseRole(WarnInfo& warnInfo, const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& checkedProgramCourse, const std::shared_ptr<TmCourseRoleBase>& tmCourseRoleBase, const vector<std::shared_ptr<TmProgramCourse>>& programCourseList, const ROSTER* instructorRoster) const;
    bool CheckBaseWithCourseRole(WarnInfo& warnInfo, const ROSTER* roster, const std::shared_ptr<TmCourseRoleBase>& tmCourseRoleBase, const vector<std::shared_ptr<TmProgramCourseInstructor>>& programCourseInstructorList, const ROSTER* instructorRoster) const;

    //仅检查PNR角色数量
    bool CheckRuleWithPairingChart(set<string>& checkedRoles, const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& checkedProgramCourse, const ROSTER* instructorRoster) const;
    bool CheckRuleWithPairingChart(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& checkedProgramCourse, const long long footprintId, const vector<std::shared_ptr<TmPairingChartRole>>& tmPairingChartRoleList, const vector<std::shared_ptr<TmProgramCourseInstructor>>& programCourseInstructorList, const ROSTER* instructorRoster) const;
	
    bool CheckRoleNumberWithPairingChart(const ROSTER* roster, const std::shared_ptr<TmPairingChartRole>& tmPairingChartRole, const vector<std::shared_ptr<TmProgramCourseInstructor>>& programCourseInstructorList, const ROSTER* instructorRoster) const;
    bool CheckBaseWithPairingChart(WarnInfo& warnInfo, const ROSTER* roster, const std::shared_ptr<TmPairingChartRole>& tmPairingChartRole, const vector<std::shared_ptr<TmProgramCourseInstructor>>& programCourseInstructorList, const ROSTER* instructorRoster) const;

    //个性化检查计划训练课程Role(CK等)的base/rank/fleet/team/qual/activing rank 限制
    bool MatchRoleBaseAndQualification(WarnInfo& warnInfo, const std::shared_ptr<TmProgramCourseRole>& tmProgramCourseRole, const time_t startTime, const time_t endTime, const std::shared_ptr<CREW>& crew, const long long fltId) const;

    bool MatchRoleBase(WarnInfo& warnInfo, const std::shared_ptr<TmCourseRoleBase>& tmCourseRoleBase, const time_t startTime, const time_t endTime, const std::shared_ptr<CREW>& crew, const long long fltId) const;
    bool MatchRoleQualification(const std::shared_ptr<TmCourseRoleQual>& tmCourseRoleQual, const time_t startTime, const time_t endTime, const std::shared_ptr<CREW>& crew) const;

    //个性化检查计划训练课程PNR角色的base/rank/fleet/team/qual/activing rank 限制
    bool MatchRoleBase(WarnInfo& warnInfo, const std::shared_ptr<TmPairingChartRole>& tmPairingChartRole, const time_t startTime, const time_t endTime, const std::shared_ptr<CREW>& crew, const long long fltId) const;
    bool MatchRoleQualification(const std::shared_ptr<TmPairingChartRoleQual>& tmPairingChartRoleQual, const time_t startTime, const time_t endTime, const std::shared_ptr<CREW>& crew) const;

    //个性化检查计划训练课程IP角色的base/rank/fleet/team/activing rank 限制
    bool MatchRoleBase(WarnInfo& warnInfo, const std::shared_ptr<TmProgramCourseIpRole>& tmProgramCourseIpRole, const std::shared_ptr<TmProgramCourseIpRoleBase>& tmProgramCourseIpRoleBase, const time_t startTime, const time_t endTime, const std::shared_ptr<CREW>& crew, const long long fltId) const;

    //个性化检查计划训练课程IP角色的base/rank/fleet/team/qual/activing rank 限制
    bool MatchRoleBaseAndQualification(WarnInfo& warnInfo, const std::shared_ptr<TmProgramCourseIpRole>& tmProgramCourseIpRole, const std::shared_ptr<TmProgramCourseIpRoleBase>& tmProgramCourseIpRoleBase, const std::shared_ptr<TmProgramCourseIpRoleQual>& tmProgramCourseIpRoleQual, const time_t startTime, const time_t endTime, const std::shared_ptr<CREW>& crew, const long long fltId) const;
    bool MatchRoleQualification(const std::shared_ptr<TmProgramCourseIpRoleBase>& tmProgramCourseIpRoleBase, const std::shared_ptr<TmProgramCourseIpRoleQual>& tmProgramCourseIpRoleQual, const time_t startTime, const time_t endTime, const std::shared_ptr<CREW>& crew, const long long fltId) const;


    //获得学员角色的实际人数
    int GetActualRoleNumber(const std::shared_ptr<TmProgramCourseRole>& tmProgramCourseRole, const vector<std::shared_ptr<TmProgramCourse>>& programCourseList) const;
    int GetActualRoleNumber(const vector<std::shared_ptr<TmCourseRoleBase>>& tmCourseRoleBaseList, const vector<std::shared_ptr<TmProgramCourse>>& programCourseList) const;

    //获得教员角色的实际人数
    int GetActualRoleNumber(const std::shared_ptr<TmProgramCourseRole>& tmProgramCourseRole, const vector<std::shared_ptr<TmProgramCourseInstructor>>& programCourseInstructorList) const;
    int GetActualRoleNumber(const vector<std::shared_ptr<TmCourseRoleBase>>& tmCourseRoleBaseList, const vector<std::shared_ptr<TmProgramCourseInstructor>>& programCourseInstructorList) const;
    int GetActualRoleNumber(const std::shared_ptr<TmPairingChartRole>& tmPairingChartRole, const vector<std::shared_ptr<TmProgramCourseInstructor>>& programCourseInstructorList) const;

    //是否掉过对PRN角色法规检查
    bool SkipCheckingPNR(const std::shared_ptr<TmProgramCourse> programCourse) const;
};


#endif //_LIMITCOURSEROLEQUALANDNUMBERSFOREVAFDRULE_H_
