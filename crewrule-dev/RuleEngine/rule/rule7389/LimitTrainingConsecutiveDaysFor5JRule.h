/**
 * @file LimitTrainingConsecutiveDaysFor5JRule.h
 * @brief 7389法规规则类 - 课程连续X天之后要安排Y天休假
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-06-08
**/

#ifndef _LIMITTRAININGCONSECUTIVEDAYSFOR5JRULE_H_
#define _LIMITTRAININGCONSECUTIVEDAYSFOR5JRULE_H_

#include <string>
#include <map>
#include <vector>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "TrainingConsecutiveDaysFor5JRuleParam.h"

class BaseActivityPeriod;
class TmProgramCourse;

class LimitTrainingConsecutiveDaysFor5JRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7389;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit LimitTrainingConsecutiveDaysFor5JRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, LimitTrainingConsecutiveDaysFor5JRule::RuleFuncId, LimitTrainingConsecutiveDaysFor5JRule::AvailableInterface) {
        ParseParam(input);
    }
    ~LimitTrainingConsecutiveDaysFor5JRule() override = default;

    bool CheckRule(const std::shared_ptr<CREW>& crew) const override;

private:
    std::vector<TrainingConsecutiveDaysFor5JRuleParam> _ruleParams;

    void ParseParam(const InputType& input);

    //检查课程连续训练天数和休息要求
    bool CheckConsecutiveCourseRest(const vector<shared_ptr<BaseActivityPeriod>>& activityPeriods, const std::shared_ptr<CREW>& crew, int offsetTZMinutes) const;

    //检查每日训练时长限制(按课程）暂时不用
    bool CheckDailyHoursLimit(const vector<shared_ptr<BaseActivityPeriod>>& activityPeriods, const std::shared_ptr<CREW>& crew, int offsetTZMinutes) const;

    //检查每日训练时长限制(按program course的课程)
    bool CheckDailyHoursLimit(const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const std::shared_ptr<CREW>& crew, int offsetTZMinutes) const;

    /**
    * 获取连续课程的最后一个index，考虑到可能存在非连续课程间隔在连续课程中间的情况，但仍然保持日历天的连续。
    * 例如：二天课程安排5节课程如下 A1(Day1),A2(Day1),B1(Day1),C1(Day2),A3(Day2)  课程A中间存在课程B和课程C，但A2、A3仍然在日历日是连续 
    * @param adjustIndex 输出首段连续课程最后一个索引（用于调整遍历的index）。输出：A2的索引
    * @param totalConsecutiveDays 输出合计课程。例如：连续2天（A1,A2,A3连续3节课，连续2天)
    * @param activityPeriods 排班列表
    * @param currIndex 当前索引。例如：0
    * @param firstProgramCourse 首个课程。例如：A1排课
    * @param currProgramCoursePnr 当前的课程PNR配置
    * @param offsetTZMinutes 时区
    * @return 获取连续课程的最后一个index。例如：A3的索引
    */
    int GetConsecutiveCourseLastIndex(int& adjustIndex, int& totalConsecutiveDays, const vector<shared_ptr<BaseActivityPeriod>>& activityPeriods, const int currIndex, const std::shared_ptr<TmProgramCourse>& firstProgramCourse, const std::shared_ptr<TmProgramCoursePnr>& currProgramCoursePnr, const int offsetTZMinutes) const;

    /**
    * 获得连续休息天数，空白天也计入休息
    * @param currIndex 当前工作任务的索引,从该索引向后遍历休息。例如：0
    * @param activityPeriods 排班列表
    * @param offsetTZMinutes 时区
    * @return 获取<连续休息天数,休息开始时间UTC，休息结束时间UTC>
    */
    std::tuple<int, time_t, time_t> GetConsecutiveRestDay(const int currIndex, const vector<shared_ptr<BaseActivityPeriod>>& activityPeriods, const int offsetTZMinutes) const;

    void ThrowRuleViolationForConsecutiveCourse(const shared_ptr<BaseActivityPeriod>& startPeriod, const shared_ptr<BaseActivityPeriod>& endPeriod, const std::shared_ptr<TmProgramCoursePnr>& tmProgramCoursePnr, const std::shared_ptr<TmCourse>& tmCourse, const int totalConsecutiveDays, const std::tuple<int, time_t, time_t>& restDays) const;
    //检查每日训练时长限制(按课程）告警暂时不用
    void ThrowRuleViolationForDailyHours(const ROSTER* roster, const std::shared_ptr<TmCourse>& tmCourse, const time_t dateUtc, const int actualHours) const;
    //检查每日训练时长限制(按program course的课程)告警
    void ThrowRuleViolationForDailyHours(const long long rosterId, const std::shared_ptr<TmProgramCoursePnr>& tmProgramCoursePnr, const std::shared_ptr<TmCourse>& tmCourse, const time_t dateUtc, const int actualHours) const;

};

#endif //_LIMITTRAININGCONSECUTIVEDAYSFOR5JRULE_H_