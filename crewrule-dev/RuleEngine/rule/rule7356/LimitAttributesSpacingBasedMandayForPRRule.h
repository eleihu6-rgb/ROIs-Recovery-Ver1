/**
 * @file LimitAttributesSpacingBasedMandayForPRRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-11-14
**/

#ifndef _LIMITATTRIBUTESSPACINGBASEDMANDAYFORPRRULE_H_
#define _LIMITATTRIBUTESSPACINGBASEDMANDAYFORPRRULE_H_

#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitAttributesSpacingBasedMandayForPRRuleParam.h"

class LimitAttributesSpacingBasedMandayForPRRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7356;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit LimitAttributesSpacingBasedMandayForPRRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitAttributesSpacingBasedMandayForPRRule::RuleFuncId, LimitAttributesSpacingBasedMandayForPRRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitAttributesSpacingBasedMandayForPRRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<LimitAttributesSpacingBasedMandayForPRRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	//检查飞行岗位(通过Manday)
	bool CheckRuleForFD(const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const LimitAttributesSpacingBasedMandayForPRRuleParam& ruleParam) const;

	//检查客舱岗位(通过Manday)
	bool CheckRuleForCC(const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const LimitAttributesSpacingBasedMandayForPRRuleParam& ruleParam) const;
	
	bool CheckRuleMinPeriod(time_t& attrAUtc, time_t& attrBUtc, const std::shared_ptr<CREW_MANDAY_BASIC>& manday, const int offsetTZMinutes, const LimitAttributesSpacingBasedMandayForPRRuleParam& ruleParam) const;

	/*
	* 检查是否满足最新时间间隔，时间顺序是先Attribute A，然后Attribute B
	* @param attrAUtc 发现Attribute A的日期(UTC)
	* @param attrBUtc 发现Attribute B的日期(UTC)
	* @param ruleParam 法规参数
	* @return true 合规，false 违规
	*/
	bool CheckRuleMinPeriod(const time_t attrAUtc, const time_t attrBUtc, const int offsetTZMinutes, const LimitAttributesSpacingBasedMandayForPRRuleParam& ruleParam) const;
private:

	void ThrowRuleViolation(const time_t attrAUtc, const time_t attrBUtc, const LimitAttributesSpacingBasedMandayForPRRuleParam& ruleParam) const;
};

#endif //_LIMITATTRIBUTESSPACINGBASEDMANDAYFORPRRULE_H_
