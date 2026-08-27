#ifndef _LIMITCONSECUTIVEWOCLFORCARSRULE_H_
#define _LIMITCONSECUTIVEWOCLFORCARSRULE_H_

#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitConsecutiveWoclForCARSRuleParam.h"
#include "../rule7500/DailyAdjustmentForCARSParam.h"

#include <memory>

class DailyAdjustmentForCARSParam;
class WorkPeriod;

class LimitConsecutiveWoclForCARSRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7503;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit LimitConsecutiveWoclForCARSRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, RuleFuncId, AvailableInterface) {
		ParseParam(input);
	}
	~LimitConsecutiveWoclForCARSRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:
	std::vector<LimitConsecutiveWoclForCARSRuleParam> _ruleParams;

	std::vector<DailyAdjustmentForCARSParam> _ruleParamsOfDailyAdjustment;

	void ParseParam(const InputType& input);

	// 适应时区偏移（分钟）：与 7501 一致，优先 Period 上的适应时区，否则使用 7500 写入 Duty 的参考时区，再回退为机组基准时区
	int GetAdjustOffsetTZ(const std::shared_ptr<WorkPeriod>& workPeriod, const int offsetTZMinutes) const;

	void ThrowRuleViolationForDutyNumber() const;
};

#endif
