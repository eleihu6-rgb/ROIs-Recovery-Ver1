/**
 * @file LimitDependBetweenCoursesForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _LIMITDEPENDBETWEENCOURSESFOREVAFDRULE_H_
#define _LIMITDEPENDBETWEENCOURSESFOREVAFDRULE_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitDependBetweenCoursesForEvaFdRuleParam.h"


struct RosterProgramCourse;


class LimitDependBetweenCoursesForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7237;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit LimitDependBetweenCoursesForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitDependBetweenCoursesForEvaFdRule::RuleFuncId, LimitDependBetweenCoursesForEvaFdRule::AvailableInterface) {
        ParseParam(input);
    }
    ~LimitDependBetweenCoursesForEvaFdRule() override = default;

    bool CheckRule(const std::shared_ptr<CREW>& crew) const override;

private:

    enum class DeviceWarnCode {
        NO = 0, //无告警
        NOT_AVAILABLE = 1, //设备不可用告警
        TIME_OVERLAP = 2, //时间冲突告警
        NUM_OF_PEOPLE = 4, //学员数量超标告警
    };

    std::vector<LimitDependBetweenCoursesForEvaFdRuleParam> _ruleParams;

    /*
    * 检查课程间强制关联关系
    * @param currRosterProgramCourse 当前计划课程
    * @param allRosterProgramCourseList 当前计划课程currRosterProgramCourse之前的所有前序课程
    * @param assignedCourseSeqs 已经排课的课程序号列表
    * @param crew 执行计划课程的人员
    * @reutrn true 合规，false 不合规
    */
    bool CheckRule(const std::shared_ptr<RosterProgramCourse>& currRosterProgramCourse, const vector<std::shared_ptr<RosterProgramCourse>>& allRosterProgramCourseList, const set<string>& assignedCourseSeqs, const std::shared_ptr<CREW>& crew) const;

    void ParseParam(const InputType& input);

    void ThrowRuleViolation(const std::shared_ptr<TmProgramCourse>& currProgramCourse, const vector<std::shared_ptr<TmProgramCourse>>& prepositionProgramCourseList) const;

    //dependencySeq：前序课程未排的courseSeq
    void ThrowRuleViolationForNotAssign(const std::shared_ptr<TmProgramCourse>& programCourseA, const string& dependencySeq) const;
    

};


#endif //_LIMITDEPENDBETWEENCOURSESFOREVAFDRULE_H_
