/**
 * @file MinOffDutyPeriodForCcRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _ACCLIMATIZATIONRULE_H_
#define _ACCLIMATIZATIONRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "AcclimatizationRuleParam.h"

class WorkPeriod;
class RestPeriod;
class WindowTime;
class Period;

class AcclimatizationRule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6005;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit AcclimatizationRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, AcclimatizationRule::RuleFuncId, AcclimatizationRule::AvailableInterface) {
        ParseParam(input);
    }
    ~AcclimatizationRule() override = default;

	void CalculateDuty(Pairing* pairing) override;

	void CalculateDuty(Duty* duty) override;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;
private:

    std::vector<AcclimatizationRuleParam> _ruleParams;

	void ParseParam(const InputType& input);


	bool CalculateDuty(Duty*& lastAcclimatisedDuty, Duty*& maxTimeZoneDiffDuty, unsigned int& maxTimeZoneDiff, string& prevDutyAcclimatisedState,
		Duty* duty, const std::size_t dutyIndex, const vector<Duty*>& duties, const std::string& base, const AcclimatizationRuleParam& ruleParam);

	//Duty通过AdaptionPeriod再次计算适应期状态
	void CalculateDutyForAdaptionPeriod(Duty*& lastAcclimatisedDuty, Duty*& maxTimeZoneDiffDuty, unsigned int& maxTimeZoneDiff, string& prevDutyAcclimatisedState,
		Duty* duty, const std::size_t dutyIndex, const vector<Duty*>& duties, const std::string& base, const AcclimatizationRuleParam& ruleParam);

	void CalculateDuty(const vector<Duty*>& duties, const std::string& base) ;

	//计算前一个Duty的Rest开始时间点的适应状态
	void CalculateDutyForRestStart(Duty* lastAcclimatisedDuty, Duty* maxTimeZoneDiffDuty, unsigned int maxTimeZoneDiff, string& prevDutyAcclimatisedState, Duty* currDuty);

	unsigned int GetMaxTimeZoneDiffBetweenDuty(Duty*& maxTimeZoneDiffDuty, const unsigned int maxTimeZoneDiff,
		Duty* currDuty, const Duty* lastAcclimatisedDuty) const;

	/**
	* 获得执行当前duty（duties[currDutyIndex]）前休息时间，包括ODP、休假和RDO
	* @param currDutyIndex 当前的Duty索引
	* @param duties duty列表
	* @return 休息时长
	*/
	int GetRestTimeBeforeDuty(const std::size_t currDutyIndex, const vector<Duty*>& duties) const;

	/**
	* 获得Adaption Period的减少值Gap
	* @param lastAcclimatisedDuty 最近适应的Duty
	* @param duty
	* @param dutyIndex
	* @param duties duty列表
	* @return Adaption period减少X小时
	*/
	int GetAdaptionPeriodAdjustment(Duty*& lastAcclimatisedDuty, Duty* currDuty, const std::size_t currDutyIndex, const vector<Duty*>& duties, const std::string& base);

	bool IsHomeBase(const Duty& duty, const std::string& base) const;

};





#endif //_ACCLIMATIZATIONRULE_H_
