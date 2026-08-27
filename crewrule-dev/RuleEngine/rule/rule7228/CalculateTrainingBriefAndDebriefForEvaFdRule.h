#pragma once
#ifndef _CALCULATETRAININGBRIEFANDDEBRIEFFOREVAFDRULE_H_
#define _CALCULATETRAININGBRIEFANDDEBRIEFFOREVAFDRULE_H_

#include <string>
#include <tuple>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "TrainingBriefAndDebriefForEvaFdRuleParam.h"



class CalculateTrainingBriefAndDebriefForEvaFdRule : public CalculateRule<int> {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7228;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit CalculateTrainingBriefAndDebriefForEvaFdRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateTrainingBriefAndDebriefForEvaFdRule::RuleFuncId, CalculateTrainingBriefAndDebriefForEvaFdRule::AvailableInterface) {
		ParseParam(input);
	}
	~CalculateTrainingBriefAndDebriefForEvaFdRule() override = default;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:


	std::vector<TrainingBriefAndDebriefForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void CalculateDuty(ROSTER* roster, const std::shared_ptr<CREW>& crew);

	void CalculateDuty(Duty* duty, ROSTER* roster, const std::shared_ptr<CREW>& crew);

	//设置Duty的签到
	void SetDutyBrief(Duty* duty, ROSTER* roster, const int briefMinutes);

	//设置Duty的签出
	void SetDutyDebrief(Duty* duty, ROSTER* roster, const int debriefMinutes);

	//设置toSegment的签到
	void SetSegmentBrief(Pairing* pairing, Duty* duty, Segment* fromSegment, Segment* toSegment, const int briefMinutes);

	//设置fromSegment的签出
	void SetSegmentDebrief(Pairing* pairing, Duty* duty, Segment* fromSegment, Segment* toSegment, const int debriefMinutes);

	//更新PairingNode的Segment节点，包括：移除被删除的Node，并调整groupId
	void updatePairingNodeOfSegment(Duty* duty, const map<long long, long long>& segmentNodeMap);

	void fixPairingAndDutyBriefAndPickupTime(Duty* duty, ROSTER* roster, shared_ptr<PairingDutyNode> brief, shared_ptr<PairingDutyNode> pickup);
	void fixPairingAndDutyDebriefAndDropoffTime(Duty* duty, ROSTER* roster, shared_ptr<PairingDutyNode> debrief, shared_ptr<PairingDutyNode> dropoff);
};

#endif //_CALCULATETRAININGBRIEFANDDEBRIEFFOREVAFDRULE_H_