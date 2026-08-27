/**
 * @file CheckTrainingRosterForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKTRAININGROSTERFOREVAFDRULE_H_
#define _CHECKTRAININGROSTERFOREVAFDRULE_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckTrainingRosterForEvaFdRuleParam.h"


struct RosterProgramCourse;


class CheckTrainingRosterForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7225;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckTrainingRosterForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckTrainingRosterForEvaFdRule::RuleFuncId, CheckTrainingRosterForEvaFdRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckTrainingRosterForEvaFdRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    enum class DeviceWarnCode {
        NO = 0, //无告警
        NOT_AVAILABLE = 1, //设备不可用告警
        TIME_OVERLAP = 2, //时间冲突告警
        NUM_OF_PEOPLE = 4, //学员数量超标告警
    };

    std::vector<CheckTrainingRosterForEvaFdRuleParam> _ruleParams;

    bool CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const;

    /*
    * 检查课程间限制
    * @param currRosterProgramCourse 当前计划课程
    * @param nextRosterProgramCourse 紧接随后计划课程（可能为空)
    * @param allPrevRosterProgramCourseList 当前计划课程currRosterProgramCourse之前的所有前序课程
    * @param crew 执行计划课程的人员
    * @reutrn true 合规，false 不合规
    */
    bool CheckRule(const std::shared_ptr<RosterProgramCourse>& currRosterProgramCourse, const std::shared_ptr<RosterProgramCourse>& nextRosterProgramCourse, const vector<std::shared_ptr<RosterProgramCourse>>& allPrevRosterProgramCourseList, const std::shared_ptr<CREW>& crew) const;

    //检查训练课程开始时间、时间段限制
    bool CheckCourseStartTimeAndTimePeriod(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const;

    /*
    * 检查训练课程开始时间、时间段限制
    * @param roster 学员或教员的roster
    * @param crew 学员或教员的crew
    * @param teProgramCourse 学员的计划课程，这里注意：若roster为教员则teProgramCourse为某个学员的计划课程（目的是为了获取上课时间，此时roster.rosterId 与 teProgramCourse.rosterid不一致）
    * @param isTrainee 是否学员
    */
    bool CheckCourseStartTimeAndTimePeriod(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const std::shared_ptr<TmProgramCourse>& teProgramCourse) const;

    //检查训练课程角色资质限制
    bool CheckCourseRoleQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& crewQuals) const;

    //检查TE/IP/CK/PNR的 min、max 人数限制
    bool CheckCourseNumberOfPeople(const ROSTER* roster) const;

    //检查课程间隔天数限制
    bool CheckGapBetweenCourses(const std::shared_ptr<RosterProgramCourse>& currRosterProgramCourse, const std::shared_ptr<RosterProgramCourse>& nextRosterProgramCourse, const std::shared_ptr<CREW>& crew) const;

    /*
    * 检查课程间强制关联关系
    * @param currRosterProgramCourse 当前计划课程
    * @param allPrevRosterProgramCourseList 当前计划课程currRosterProgramCourse之前的所有前序课程
    * @param crew 执行计划课程的人员
    * @reutrn true 合规，false 不合规
    */
    bool CheckDependencyBetweenCourses(const std::shared_ptr<RosterProgramCourse>& currRosterProgramCourse, const vector<std::shared_ptr<RosterProgramCourse>>& allPrevRosterProgramCourseList, const std::shared_ptr<CREW>& crew) const;

    //检查训练课程设备（Device）限制
    bool CheckCourseDevice(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& crewQuals) const;

    void ParseParam(const InputType& input);

    void ThrowRuleViolationForCourseStartTime(const ROSTER* roster) const;

    void ThrowRuleViolationForCourseTimePeriod(const ROSTER* roster) const;

    void ThrowRuleViolationForCourseTimePeriodDuration(const ROSTER* roster) const;

    void ThrowRuleViolationForCourseIPCKQualification(const ROSTER* roster) const;

    void ThrowRuleViolationForPnrQualification(const ROSTER* roster) const;

    void ThrowRuleViolationForCourseRoleQualification(const ROSTER* roster) const;

    void ThrowRuleViolationForCourseDeviceType(const ROSTER* roster) const;

    void ThrowRuleViolationForCourseDeviceTime(const ROSTER* roster) const;

    void ThrowRuleViolationForCourseNumberOfPeopleWithDevice(const ROSTER* roster) const;

    void ThrowRuleViolationForNumberOfPeople(const ROSTER* roster) const;

    void ThrowRuleViolationForGapBetweenCourses(const std::shared_ptr<TmProgramCourse>& programCourse) const;

    void ThrowRuleViolationForDependencyBetweenCourses(const std::shared_ptr<TmProgramCourse>& programCourse) const;

private:

    //个性化检查计划训练课程伙伴PNR(Partner)的base/rank/fleet/team/qual 限制
    bool CheckCoursePnrQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& crewQuals, const std::shared_ptr<TmProgramCoursePnr>& tmProgramCoursePnr) const;

    //个性化检查计划训练课程教员(IP)和检查员(CK)资质（IP/CK）限制
    bool CheckCourseIPCKQualification(const vector<string>& crewQuals, const vector<std::shared_ptr<TmProgramCourseIpck>>& tmProgramCourseIpckList) const;
    bool CheckCourseIPCKQualification(const vector<string>& crewQuals, const std::shared_ptr<TmProgramCourseIpck>& tmProgramCourseIpck) const;

    //检查训练课程其他角色资质限制
    bool CheckCourseRoleQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& crewQuals, const string& crewRole, const long long courseId) const;

    bool CheckCourseRoleQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& crewQuals, const std::shared_ptr<TmCourseRoleBase>& tmCourseRoleBase) const;

    bool CheckCourseRoleQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& crewQuals, const string& crewRole, const std::shared_ptr<TmCourseRoleQual>& tmCourseRoleQual) const;

    //检查训练课程开始时间限制
    bool CheckCourseStartTime(const int rosterStartTimeMinute, const std::shared_ptr<TmProgramCoursePnr>& tmProgramCoursePnr) const;

    bool CheckCourseStartTime(const int rosterStartTimeMinute, const std::shared_ptr<TmCourse>& tmCourse) const;

    //检查训练课程时间段限制 - 开始时间和结束时间
    bool CheckCourseTimePeriod(const int rosterStartTimeMinute, const int rosterEndTimeMinute, const std::shared_ptr<TmProgramCoursePnr>& programCoursePnr) const;

    bool CheckCourseTimePeriod(const int rosterStartTimeMinute, const int rosterEndTimeMinute, const std::shared_ptr<TmCourse>& tmCourse) const;

    //检查训练课程时间段限制 - 持续时长。rosterDurationMinute：非Line课程的时长（分钟数），rosterCourseLegNum：Line课程的航段Leg数量。
    bool CheckCourseTimePeriodDuration(const int rosterDurationMinute, const int rosterCourseLegNum, const std::shared_ptr<TmProgramCoursePnr>& programCoursePnr, const std::shared_ptr<TmCourse>& tmCourse) const;

    bool CheckCourseTimePeriodDuration(const int rosterDurationMinute, const int rosterCourseLegNum, const std::shared_ptr<TmCourseDuration>& tmCourseDuration, const std::shared_ptr<TmCourse>& tmCourse) const;

    /*
    * 检查计划训练课程设备类型（Device）限制
    * @param programCourseDevice: 课程使用的设备
    */
    bool CheckCourseDeviceType(const std::shared_ptr<TmDevice>& programCourseDevice, const std::shared_ptr<TmProgramCourse>& programCourse) const;

    /*
    * 检查计划训练课程设备时间（Device）限制
    * @param programCourseDevice: 计划课程使用的设备
    * @param programCourseDeviceTime: 计划课程使用的设备时间
    */
    int CheckCourseDeviceTime(const std::shared_ptr<TmProgramCourse>& programCourse, const std::shared_ptr<TmDevice>& programCourseDevice, const std::shared_ptr<TmDeviceTime>& programCourseDeviceTime) const;

    /*
    * 检查不同角色min、max 人数限制，角色：TE (学员)、IP（教员）、CK（检查员）、PNR（伙伴）
    * role: roster的角色
    * groupId: 同时上课人员组ID (tm_program_course.group_id, tm_program_course_instructor.group_id)
    * courseId：课程ID (tm_course.id)
    */
    bool CheckCourseNumberOfPeople(const ROSTER* roster, const string& role, const std::shared_ptr<TmProgramCourse>& teProgramCourse) const;

    /*
    * 标准化配置检查不同角色min、max 人数限制
    * role: roster的角色
    * groupId: 同时上课人员组ID (tm_program_course.group_id, tm_program_course_instructor.group_id)
    * courseId：课程ID (tm_course.id)
    */
    bool CheckCourseNumberOfPeopleWithCourseRole(const ROSTER* roster, const string& role, const string& groupId, const long long& courseId) const;

    //获得计划课程时长（单位：分钟）
    int GetProgramCourseDuration(const std::shared_ptr<TmProgramCoursePnr>& programCoursePnr) const;

    //获得Line课程的排班的航段Leg数量
    int GetRosterCourseLegNum(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const std::shared_ptr<TmProgramCourse>& teProgramCourse) const;
};


#endif //_CHECKTRAININGROSTERFOREVAFDRULE_H_
