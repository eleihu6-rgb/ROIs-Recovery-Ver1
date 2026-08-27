/**
 * @file CalculateMinRestForHXRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-02-12
**/

#ifndef _CALCULATEMINRESTFORHXRULE_H_
#define _CALCULATEMINRESTFORHXRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CalculateMinRestForHXRuleParam.h"


class CalculateMinRestForHXRule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7488;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CalculateMinRestForHXRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateMinRestForHXRule::RuleFuncId, CalculateMinRestForHXRule::AvailableInterface) {
		ParseParam(input);
	}

	~CalculateMinRestForHXRule() override = default;

	void CalculateDuty(Duty* duty) override;

	void CalculateDuty(Pairing* pairing) override;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:

	//CalculateMinRestForHXRuleParam聚合其他参数对象
	std::unique_ptr<CalculateMinRestForHXRuleParam> _ruleParam{ nullptr };

	void ParseParam(const InputType& input);

	void CalculateDuty(vector<Duty*>& duties, const unordered_map<long long, int>& unaccAwayFromBaseDutyMap, const int offsetTZMinutes);

	//地面任务计算min rest
	void CalculateGroundRoster(ROSTER* prevRoster, ROSTER* currRoster, const int offsetTZMinutes);

    //飞行任务计算min rest
	void CalculateDuty(Duty* currDuty, Duty* nextDuty, ROSTER* prevRoster, ROSTER* currRoster, const unordered_map<long long, int>& unaccAwayFromBaseDutyMap, const int offsetTZMinutes);
private:
	/*
    * 获取第一个未适应状态的Duty签到开始时间与基地（Pairing第一个Duty（适应状态）签到开始时间）的时长
	* @return key: duty id, value: 间隔时长(分钟数)
    *
	*/
	unordered_map<long long, int> GetUnaccAwayFromBaseDurationMap(const std::vector<const ROSTER*>& rosters) const;
	unordered_map<long long, int> GetUnaccAwayFromBaseDurationMap(const Pairing* pairing) const;

	/*
    * 获得Duty前一个Roster的Map，key: Duty id, value: <前一个Roster,当前Duty的Roster>
    * @return key: duty id, value: <前一个Roster,当前Duty的Roster>
	*/
	unordered_map<long long, std::tuple<ROSTER*, ROSTER*>> GetPrevRosterMap(const std::vector<const ROSTER*>& rosters) const;

	/*
	* 获得Standby Rest（7483定义规则）
	*/
	int GetMinRestBasedOnStandby(const int minRest, const Duty* currDuty, const ROSTER* prevRoster, const ROSTER* currRoster, const int offsetTZMinutes) const;

    //获取Duty内的最大时区差值(分钟数)
	//计算方法: Duty所有经过航站与Duty起飞机场最大时区差
    int GetMaxTZDiffInDuty(const Duty* duty) const;

    //获取Duty的MinRest要求，返回：min rest（分钟数）
	int GetDutyMinRest(const Duty* duty, const int offsetTZMinutes, const StandardMinRestForHXRuleParam& ruleParam) const;

	//获取地面任务的MinRest要求，返回：min rest（分钟数）
	int GetGroundRosterMinRest(const ROSTER* roster, const int offsetTZMinutes, const StandardMinRestForHXRuleParam& ruleParam) const;

	//获得满足生理休息(本地夜晚)的时区
	int GetPhysiologicalRestTimeZone(const Duty* duty, const int offsetTZMinutes, const StandardMinRestForHXRuleParam& ruleParam) const;

    //获取Duty的MinRest要求包含生理休息，返回：min rest（分钟数）
	int GetMinRestMeetingLocalNight(const Duty* duty, const int minRest, const int offsetTZMinutes) const;

	//获得Layover后最新的MinRest
	int GetAdjustMinRestBasedOnLayover(bool& match, const int minRest, const Duty* currDuty, const Duty* nextDuty) const;

	//获得Meger DP后最新的MinRest
	int GetAdjustMinRestBasedOnMergeDP(bool& match, const int minRest, const Duty* currDuty, const ROSTER* currRoster, const StandardMinRestForHXRuleParam& ruleParam) const;

};

#endif //_CALCULATEMINRESTFORHXRULE_H_
