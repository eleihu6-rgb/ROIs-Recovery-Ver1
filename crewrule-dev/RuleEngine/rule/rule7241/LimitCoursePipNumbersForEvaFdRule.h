/**
 * @file LimitCoursePipNumbersForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LIMITCOURSEPIPNUMBERSFOREVAFDRULE_H_
#define _LIMITCOURSEPIPNUMBERSFOREVAFDRULE_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitCoursePipNumbersForEvaFdRuleParam.h"


struct RosterProgramCourse;


class LimitCoursePipNumbersForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7241;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit LimitCoursePipNumbersForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitCoursePipNumbersForEvaFdRule::RuleFuncId, LimitCoursePipNumbersForEvaFdRule::AvailableInterface) {
        ParseParam(input);
    }
    ~LimitCoursePipNumbersForEvaFdRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    enum class DeviceWarnCode {
        NO = 0, //无告警
        NOT_AVAILABLE = 1, //设备不可用告警
        TIME_OVERLAP = 2, //时间冲突告警
        NUM_OF_PEOPLE = 4, //学员数量超标告警
    };

    std::vector<LimitCoursePipNumbersForEvaFdRuleParam> _ruleParams;

    //检查TE/IP/CK/PNR的 min、max 人数限制
    bool CheckRule(const ROSTER* roster) const;

    void ParseParam(const InputType& input);

    void ThrowRuleViolation(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& programCourse, const std::shared_ptr<TmProgramPip>& tmProgramPip, const std::set<string>& actualCrewIdsOfPIP) const;

    void ThrowRuleViolation(const ROSTER* roster, const set<string>& missingCrewIds, const std::shared_ptr<TmProgramCourse>& programCourse, const std::shared_ptr<TmProgramPip>& tmProgramPip, const std::set<string>& actualCrewIdsOfPIP) const;

private:

    /*
    * 检查PIP
    * teRoster: 学员排班roster
    * programCourse: 学员的program course
    */
    bool CheckRule(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& programCourse) const;

};


#endif //_LIMITCOURSEPIPNUMBERSFOREVAFDRULE_H_
