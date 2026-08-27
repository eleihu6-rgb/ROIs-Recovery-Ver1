/**
 * @file TaskOnlyBeOperatedByFilteredCrewForPRRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-10-15
**/

#ifndef _TASKONLYBEOPERATEDBYFILTEREDCREWFORPRRULE_H_
#define _TASKONLYBEOPERATEDBYFILTEREDCREWFORPRRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "TaskOnlyBeOperatedByFilteredCrewForPRRuleParam.h"

class TaskOnlyBeOperatedByFilteredCrewForPRRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7321;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit TaskOnlyBeOperatedByFilteredCrewForPRRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, TaskOnlyBeOperatedByFilteredCrewForPRRule::RuleFuncId, TaskOnlyBeOperatedByFilteredCrewForPRRule::AvailableInterface) {
		ParseParam(input);
	}
	~TaskOnlyBeOperatedByFilteredCrewForPRRule() override = default;

	//缓存初始化，移除和更新操作
	void InitTaskAndCrewRuleParamMap(const vector<std::shared_ptr<CREW>>& crewList);
	void RemoveTaskAndCrewRuleParamMap(const std::shared_ptr<CREW>& crew, const std::shared_ptr<ROSTER>& roster, const Pairing* oldPairing);
	void UpdateTaskAndCrewRuleParamMap(const std::shared_ptr<CREW>& crew, const std::shared_ptr<ROSTER>& roster);
	void UpdateTaskRosterId(const long long oldId, const long long newId);

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<TaskOnlyBeOperatedByFilteredCrewForPRRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	//bool CheckRule(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, const TaskOnlyBeOperatedByFilteredCrewForPRRuleParam& ruleParam) const;

private:
	struct TaskToCrewOfPhase {
		//预处理所有task的ruleParam
		unordered_map<long long, unordered_map<long long, set<string>>> allTaskRuleParamToCrewMap; //map<SegmentOrGroundRosterRuleParamId, map<CrewRuleParamId, set<CrewId>>， CrewRuleParamId可能为-1（-1表示该Crew没有在规则中配置）

		unordered_map<long long, long long> allTaskToRuleParamMap; //map<SegmentOrGroundRosterId, RuleParamId>

		unordered_map<long long, TaskOnlyBeOperatedByFilteredCrewForPRRuleParam*> ruleParamMap;  //map<RuleParamId, TaskOnlyBeOperatedByFilteredCrewForPRRuleParam>

	};

	void UpdateTaskAndCrewRuleParamMap(const std::shared_ptr<CREW>& crew);

	//bool CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const TaskOnlyBeOperatedByFilteredCrewForPRRuleParam& ruleParam) const;

	////Crew是否能执行地面任务，true：能执行，false：不能执行
	//bool CanOperate(const ROSTER* roster, const TaskOnlyBeOperatedByFilteredCrewForPRRuleParam& ruleParam) const;

	////Crew是否能执行航班任务，true：能执行，false：不能执行
	//bool CanOperate(const ROSTER* roster, const Segment* segment, const TaskOnlyBeOperatedByFilteredCrewForPRRuleParam& ruleParam) const;

	void ThrowRuleViolationForFlight(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const Segment* segment, const TaskOnlyBeOperatedByFilteredCrewForPRRuleParam& ruleParam) const;

	void ThrowRuleViolationForGroundRoster(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const TaskOnlyBeOperatedByFilteredCrewForPRRuleParam& ruleParam) const;

private:
	//按阶段预处理所有task的ruleParam
	unordered_map<long long, TaskToCrewOfPhase> _phaseToAllTaskToCrewMap; //map<Phase, AllTaskToCrewOfPhase>
};

#endif //_TASKONLYBEOPERATEDBYFILTEREDCREWFORPRRULE_H_
