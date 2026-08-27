/**
 * @file CheckCumulativeFtLimitForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKCUMULATIVEFTLIMITFOREVAFDRULE_H_
#define _CHECKCUMULATIVEFTLIMITFOREVAFDRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CumulativeFtLimitForEvaFdRuleParam.h"
#include "../period/SlideListener.h"

class WorkPeriod;
class RestPeriod;
class WindowTime;
class Period;
class CumulativeFtLimitSlideListener;

class CheckCumulativeFtLimitForEvaFdRule: public BasicRule {
	friend class CumulativeFtLimitSlideListener;
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7202;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckCumulativeFtLimitForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckCumulativeFtLimitForEvaFdRule::RuleFuncId, CheckCumulativeFtLimitForEvaFdRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckCumulativeFtLimitForEvaFdRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    std::vector<CumulativeFtLimitForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const long blhTotalMins, const time_t windowStart, const time_t windowEnd, int offsetTZMinutes, const CumulativeFtLimitForEvaFdRuleParam& ruleParam) const;

	int GetTimeZoneOffset(const time_t baseUtcTime, const std::shared_ptr<CREW>& crew) const;

	void ThrowRuleViolation() const;
};


class CumulativeFtLimitSlideListener : public SlideListener {
public:

	CumulativeFtLimitSlideListener(const CheckCumulativeFtLimitForEvaFdRule* rule) : _rule(rule) { }


	bool OnSlide(bool& next, bool& ignoreSlide, const Period* period, const Period* nextPeriod, const time_t windowStartLoc, const time_t windowEndLoc, int offsetTZMinutes, void* param, ...) const override;

private:

	const CheckCumulativeFtLimitForEvaFdRule* _rule;

	mutable time_t _currWindowStart = -1;

	mutable time_t _currWindowEnd = -1;

	mutable long _BLHTotalMinutes = -1; //累计飞时（FT, 也称 BLH)（分钟数）

	//判断是否与当前时间窗口相同
	bool isSameWindow(const time_t windowStart, const time_t windowEnd) const {
		return _currWindowStart == windowStart && _currWindowEnd == windowEnd;
	}
};

#endif //_CHECKCUMULATIVEFTLIMITFOREVAFDRULE_H_
