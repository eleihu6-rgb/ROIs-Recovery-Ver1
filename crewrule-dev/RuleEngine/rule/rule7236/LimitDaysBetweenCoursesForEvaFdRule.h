/**
 * @file LimitDaysBetweenCoursesForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LIMITDAYSBETWEENCOURSESFOREVAFDRULE_H_
#define _LIMITDAYSBETWEENCOURSESFOREVAFDRULE_H_

#include <string>
#include <tuple>
#include <climits>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitDaysBetweenCoursesForEvaFdRuleParam.h"


struct RosterProgramCourse;


class LimitDaysBetweenCoursesForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7236;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit LimitDaysBetweenCoursesForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitDaysBetweenCoursesForEvaFdRule::RuleFuncId, LimitDaysBetweenCoursesForEvaFdRule::AvailableInterface) {
        ParseParam(input);
    }
    ~LimitDaysBetweenCoursesForEvaFdRule() override = default;

    bool CheckRule(const std::shared_ptr<CREW>& crew) const override;

private:

    std::vector<LimitDaysBetweenCoursesForEvaFdRuleParam> _ruleParams;

    /*课程间隔天数限制
    * 规则逻辑：课程间隔天数= 前一个课程结束时间 - 后一个课程开始时间。
    * currChildRosterProgramCourseList和dependenceChildProgramCourseList存在多个子课程，课程之间先后可能存在交叉
    * @param currChildRosterProgramCourseList  当前计划已排子课程列表
    * @param dependenceChildProgramCourseList  依赖间隔课程的已排子课程列表
    * @return true 合规，false 不合规
    */
    bool CheckRule(const vector<std::shared_ptr<TmProgramCourse>>& currChildRosterProgramCourseList, const vector<std::shared_ptr<TmProgramCourse>>& dependenceChildProgramCourseList,
        const std::shared_ptr<TmProgramCourseMore>& tmProgramCourseMore, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes) const;

    void ParseParam(const InputType& input);

    void ThrowRuleViolationForGapBetweenCourses(const std::shared_ptr<TmProgramCourse>& programCourse, const std::shared_ptr<TmProgramCourseMore>& tmProgramCourseMore) const;

};


#endif //_LIMITDAYSBETWEENCOURSESFOREVAFDRULE_H_
