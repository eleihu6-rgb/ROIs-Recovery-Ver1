/**
 * @file LimitCourseDurationForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LIMITCOURSEDURATIONFOREVAFDRULE_H_
#define _LIMITCOURSEDURATIONFOREVAFDRULE_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitCourseDurationForEvaFdRuleParam.h"


struct RosterProgramCourse;


class LimitCourseDurationForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7242;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit LimitCourseDurationForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitCourseDurationForEvaFdRule::RuleFuncId, LimitCourseDurationForEvaFdRule::AvailableInterface) {
        ParseParam(input);
    }
    ~LimitCourseDurationForEvaFdRule() override = default;

    bool CheckRule(const std::shared_ptr<CREW>& crew) const override;

private:

    std::vector<LimitCourseDurationForEvaFdRuleParam> _ruleParams;

    //检查训练课程时长限制
    bool CheckRule(const long long programId, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes) const;

    /*
    * 检查训练课程时长限制
    * @param actualDurationMinute 实际时长（分钟数）
    * @param actualLegNum 实际航段数量
    * @param parentProgramCourse 学员的计划课程（父课程）
    * @param tmCourse 学员
    * @param crew 学员或教员的crew
    */
    bool CheckRule(const int actualDurationMinute, const int actualLegNum, const std::shared_ptr<TmProgramCourse>& parentProgramCourse, const vector<std::shared_ptr<TmProgramCourse>>& childProgramCourseList, const std::shared_ptr<TmCourse>& tmCourse, const std::shared_ptr<CREW>& crew) const;

    void ParseParam(const InputType& input);

    void ThrowRuleViolation(const std::shared_ptr<TmProgramCourse>& parentProgramCourse, const vector<std::shared_ptr<TmProgramCourse>>& childProgramCourseList, const std::shared_ptr<TmCourse>& tmCourse) const;

private:

    //检查是否需要忽略该课程的时长限制
    bool IgnoreCourse(const std::shared_ptr<TmCourse>& tmCourse) const;

    /*
    * 检查训练课程时间段限制 - 持续时长。actualDurationMinute：非Line课程的时长（分钟数），actualLegNum：Line课程的航段Leg数量。
    * @param actualDurationMinute 实际排班时长（针对培训类型：SIM、GROUND）
    * @param actualLegNum 实际航段数量（针对培训类型：LINE）
    * @param programCoursePnr 计划课程的配置参数（个性化配置）
    * @param tmCourse 课程
    */
    bool CheckCourseDuration(const int actualDurationMinute, const int actualLegNum, const std::shared_ptr<CREW>& crew, const std::shared_ptr<TmProgramCourse>& parentProgramCourse, const std::shared_ptr<TmProgramCoursePnr>& programCoursePnr, const std::shared_ptr<TmCourse>& tmCourse) const;

    /*
    * 检查训练课程时间段限制 - 持续时长。actualDurationMinute：非Line课程的时长（分钟数），actualLegNum：Line课程的航段Leg数量。
    * @param actualDurationMinute 实际排班时长（针对培训类型：SIM、GROUND）
    * @param actualLegNum 实际航段数量（针对培训类型：LINE）
    * @param tmCourseDuration 计划课程的配置参数（标准化配置）
    * @param tmCourse 课程
    */
    bool CheckCourseDuration(const int actualDurationMinute, const int actualLegNum, const std::shared_ptr<TmCourseDuration>& tmCourseDuration, const std::shared_ptr<TmCourse>& tmCourse) const;

    //获得GROUND计划课程时长（单位：分钟）
    int GetProgramCourseDuration(const std::shared_ptr<TmProgramCoursePnr>& programCoursePnr) const;

    //获得告警时间范围
    std::tuple<long long, time_t, time_t> GetWarningPeriod(const vector<std::shared_ptr<TmProgramCourse>>& childProgramCourseList) const;

    //获得ProgramCourse的实际时长和航段数量（二选一，其中一个为-1表示无效值），返回值：tuple<实际时长分钟数，实际航段数量（腿数）>
    std::tuple<int, int> GetActualDurationAndLegNumOfProgramCourse(const std::shared_ptr<TmCourse>& tmCourse, const vector<std::shared_ptr<TmProgramCourse>>& childProgramCourseList, const int offsetTZMinutes) const;

};


#endif //_LIMITCOURSEDURATIONFOREVAFDRULE_H_
