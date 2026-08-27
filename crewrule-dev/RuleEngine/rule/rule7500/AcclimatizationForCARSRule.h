/**
 * @file MinOffDutyPeriodForCcRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-03-16
**/



#ifndef _ACCLIMATIZATIONFORCARSRULE_H_
#define _ACCLIMATIZATIONFORCARSRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "AcclimatizationForCARSRuleParam.h"

class WorkPeriod;
class RestPeriod;
class WindowTime;
class Period;

class AcclimatizationForCARSRule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6005;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit AcclimatizationForCARSRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, AcclimatizationForCARSRule::RuleFuncId, AcclimatizationForCARSRule::AvailableInterface) {
        ParseParam(input);
    }
    ~AcclimatizationForCARSRule() override = default;

	void CalculateDuty(Pairing* pairing) override;

	void CalculateDuty(Duty* duty) override;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;
private:

	//适应状态计算上下文
	struct AccContext {
		int movingAccTimeZoneMinutes = 0; //渐进调整的适应参考时区(单位：分钟)。也是整个roster line计算过程中实时记录的当时适应时区。初始值为第一个Duty的起飞机场地点时区
		int prevAccTimeZoneMinutesBeforeStayTimeZoneChange = 0; //发生时区转换时，上一个适应时区(开始站点的时区) (单位：分钟)。初始值为第一个Duty的起飞机场地点时区
		                                //固定这个值，直到下一次时区变化。用于计算在当前时区停留时间内的适应时区变化。
		int stayTimeZoneMinutes = 0; //最近新地点时区(单位：分钟)
        time_t stayStartTimeUtc = 0; //最近新地点停留开始时间(UTC)
	};

	//AcclimatizationForCARSRuleParam聚合其他参数对象
	std::unique_ptr<AcclimatizationForCARSRuleParam> _ruleParam{ nullptr };

	void ParseParam(const InputType& input);


	void CalculateDuty(AccContext& ctx, Duty* duty, const DailyAdjustmentForCARSParam& ruleParam);

	bool CalculateDuty(AccContext& ctx, Duty* duty, const AcclimatizationStayPeriodForCARSParam& ruleParam);

	//Duty通过AdaptionPeriod再次计算适应期状态
	void CalculateDutyForAdaptionPeriod(Duty*& lastAcclimatisedDuty, Duty*& maxTimeZoneDiffDuty, unsigned int& maxTimeZoneDiff, string& prevDutyAcclimatisedState,
		Duty* duty, const std::size_t dutyIndex, const vector<Duty*>& duties, const std::string& base, const DailyAdjustmentForCARSParam& ruleParam);

	void CalculateDuty(AccContext& ctx, const vector<Duty*>& duties, const std::string& base) ;

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





#endif //_ACCLIMATIZATIONFORCARSRULE_H_
