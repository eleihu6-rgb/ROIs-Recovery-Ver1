/**
 * @file CheckCourseDeviceAvailForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKCOURSEDEVICEAVAILFOREVAFDRULE_H_
#define _CHECKCOURSEDEVICEAVAILFOREVAFDRULE_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckCourseDeviceAvailForEvaFdRuleParam.h"


struct RosterProgramCourse;


class CheckCourseDeviceAvailForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7240;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckCourseDeviceAvailForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckCourseDeviceAvailForEvaFdRule::RuleFuncId, CheckCourseDeviceAvailForEvaFdRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckCourseDeviceAvailForEvaFdRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    enum class DeviceWarnCode {
        NO = 0, //无告警
        NOT_AVAILABLE = 1, //设备不可用告警
        TIME_OVERLAP = 2, //时间冲突告警
        TIME_OVERLAP2 = 4, //时间冲突告警2
        NUM_OF_PEOPLE = 8, //学员数量超标告警
    };

    std::vector<CheckCourseDeviceAvailForEvaFdRuleParam> _ruleParams;

    //检查训练课程设备（Device）限制
    bool CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const;

    void ParseParam(const InputType& input);

    void ThrowRuleViolationForCourseDeviceNotAvail(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& programCourse) const;

    void ThrowRuleViolationForCourseDeviceTime(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& programCourse) const;

    void ThrowRuleViolationForCourseDeviceTime2(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& programCourse) const;

    void ThrowRuleViolationForCourseNumberOfPeopleWithDevice(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& programCourse) const;

private:

    /*
    * 检查计划训练课程设备时间（Device）限制
    * @param programCourseDevice: 计划课程使用的设备
    * @param programCourseDeviceTime: 计划课程使用的设备时间
    */
    int CheckCourseDeviceTime(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& programCourse, const std::shared_ptr<TmDevice>& programCourseDevice, const std::shared_ptr<TmDeviceTime>& programCourseDeviceTime) const;
};


#endif //_CHECKCOURSEDEVICEAVAILFOREVAFDRULE_H_
