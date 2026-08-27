/**
 * @file MinOffDutyPeriodForCcRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-01-12
**/

#ifndef _ACCLIMATIZATIONFORHXRULE_H_
#define _ACCLIMATIZATIONFORHXRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "../rule7401/AnrDayOffDefinition.h"
#include "AcclimatizationForHXRuleParam.h"
#include "../constant/Constants.h"

class WorkPeriod;
class RestPeriod;
class WindowTime;
class Period;

class AcclimatizationForHXRule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7482;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit AcclimatizationForHXRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, AcclimatizationForHXRule::RuleFuncId, AcclimatizationForHXRule::AvailableInterface) {
        ParseParam(input);
    }
    ~AcclimatizationForHXRule() override = default;

	void CalculateDuty(Pairing* pairing) override;

	void CalculateDuty(Duty* duty) override;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;
private:
	//适应状态计算上下文
	struct AccContext {
		Duty* lastAcclimatisedDuty = nullptr; //最近处于适应状态的Duty

		string prevDutyAcclimatisedState = AcclimatizationState::ACCLIMATIZED; //前一个Duty的适应状态。取值：A-适应状态，U-未知状态

		Duty* firstUnacclimatisedDuty = nullptr; //第一个未适应状态的Duty

		Activity* redEyedDuty = nullptr; //第一个未适应状态的Duty的紧接前面的红眼任务Duty(Duty或地面任务)

        bool canRecoveryAcclimatisedStateOfNextDuty = false; //下一个Duty能否通过RecoveryPeriod恢复到适应状态,默认：false

		//Crew相关信息
		string crewId;
		 
		//Pairing相关信息
		Pairing* pairing = nullptr; //当前Pairing

		string pairingBase; //Pairing基地

		int pairingDuration = 0; //Pairing时长，单位分钟

		int maxTZDiffOfPairing = 0; //Pairing中与Base之间最大时差

		//基准时区
		int offsetTZMinutes = 0; //机组人员时区偏移，单位分钟

		//休息相关信息
		int consecutiveLocalNightTimes = 0; //连续本地夜次数

	};

    std::vector<AcclimatizationForHXRuleParam> _ruleParams;

	AnrDayOffDefinition _dayOffDefinition;

	void ParseParam(const InputType& input);

	//duties: Pairing的Duty列表
	void CalculateDuty(AccContext& ctx, const vector<Duty*>& duties, const bool isFirstPairing);

	bool CalculateDuty(AccContext& ctx, Duty* duty, const std::size_t dutyIndex, const vector<Duty*>& duties, const bool isFirstPairing, const AcclimatizationForHXRuleParam& ruleParam);

	//计算当前Duty的Rest开始时间点的适应状态(Duty到达落地机场时还未开始休息，此时的适应状态)
	void CalculateDutyForRestStart(AccContext& ctx, Duty* currDuty);

	//Duty通过RecoveryPeriod能否将下一个Duty从未适应状态恢复到适应状态(Duty之间Layover的休息后，下一个Duty能否转换成适应状态，仅适用于客舱)
	bool CanRecoveryAcclimatisedState(AccContext& ctx, const Duty* currDuty, const Duty* nextDuty, const vector<Duty*>& duties, const AcclimatizationForHXRuleParam& ruleParam);

	//Duty通过RecoveryPeriod能否将下一个Duty从未适应状态恢复到适应状态(Pairing结束休息后，下一个Duty能否转换成适应状态，适用于客舱和飞行)
	bool CanRecoveryAcclimatisedState(AccContext& ctx, const Duty* currDuty, const vector<Duty*>& duties, const size_t rosterIndex, const std::vector<const ROSTER*>& rosters, const AcclimatizationForHXRuleParam& ruleParam);

	//休息时长是否满足恢复成适应状态的条件
	bool CanRecoveryAcclimatisedState(const int consecutiveLocalNightTimes, const int daysOff, const RecoveryPeriodForHXParam& recoveryPeriodParam);

	//获得通过RecoveryPeriod恢复到适应状态的结束时间(UTC)
	time_t GetRecoveryAcclimatisedStateEndTimeUtc(const vector<Duty*>& duties, const size_t rosterIndex, const std::vector<const ROSTER*>& rosters, const int offsetTZMinutes) const;

	bool MatchRecoveryPeriodParam(const AccContext& ctx, const int dutyCycleInUnacclimatizedState, const Duty* currDuty, const RecoveryPeriodForHXParam& recoveryPeriodParam) const;

	void UpdateRosterFlightAccState(const AccContext& ctx, const Duty* duty);

	//获得Pairing的时长，单位分钟
	int GetPairingDuration(const Pairing* pairing) const;

	//获得Pairing经过站点与Base站点的最大时区差，单位分钟数
	int GetMaxTZDiffOfPairing(const Pairing* pairing) const;

	//获得DO数量和本地夜晚数量
	void GetDaysOffAndLocalNight(int& daysOff, int& localNightNum, const size_t currRosterIndex, const std::vector<const ROSTER*>& rosters, const int offsetTZMinutes) const;

};

#endif //_ACCLIMATIZATIONFORHXRULE_H_
