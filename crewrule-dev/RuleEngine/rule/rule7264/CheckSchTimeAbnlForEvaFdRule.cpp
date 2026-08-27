/**
 * @file CheckSchTimeAbnlForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckSchTimeAbnlForEvaFdRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

bool CheckSchTimeAbnlForEvaFdRule::CheckRule(const Pairing* pairing) const {
	return CheckRule(pairing->getDutyVec());
}

bool CheckSchTimeAbnlForEvaFdRule::CheckRule(const Duty* duty) const {
	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	return CheckRule(duties);
}

bool CheckSchTimeAbnlForEvaFdRule::CheckRule(const vector<Duty*>& duties) const {
	if (duties.empty()) {
		return true;
	}

	bool passAllRule = true;
	for (auto& duty : duties) {
		for (const auto & ruleParam : _ruleParams) {
			_ruleViolation.SetRuleParam(ruleParam);
			if (ruleParam.MatchParam(*duty)) {
				if (!CheckTimeAbnormality(duty, ruleParam)) {
					bool valid = false;
					
					if (!valid) {
						passAllRule = false;
						if (!this->IsCheckAllRule()) {
							break;
						}
					}
				}
			}
		}
	}
	return passAllRule;
}

bool CheckSchTimeAbnlForEvaFdRule::CheckTimeAbnormality(const Duty* duty, const CheckSchTimeAbnlForEvaFdRuleParam& ruleParam) const {
	bool valid = true;
	string timeType = "SCH";
	if (ruleParam._timeType == "ACT") {
		timeType = "ACT";
	}
	for (size_t i = 0; i < duty->getSegments().size(); i++) {
		Segment* currSeg = duty->getSegment(i);
		Segment* nextSeg = (i == duty->getSegments().size() - 1) ? nullptr : duty->getSegment(i + 1);
		if (nextSeg == nullptr) {
			continue;
		}
		time_t currEndTimeUtc = currSeg->getEndTimeUtc(timeType);
		time_t nextStartTimeUtc = nextSeg->getStartTimeUtc(timeType);
		if (nextStartTimeUtc < currEndTimeUtc) {
			ThrowRuleViolation(duty, currSeg, nextSeg);
			valid = false;
		}
	}
	return valid;
}

void CheckSchTimeAbnlForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckSchTimeAbnlForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	for (auto& ruleParam : _ruleParams) {
		if (ruleParam._flightFleetInDuty != RuleParamConstant::ALL) {
			set<string> fleets;
			split(ruleParam._flightFleetInDuty.c_str(), '|', fleets);
			RuleParams::GetInstancePtr()->schTimeCheckFleets.insert(fleets.begin(), fleets.end());
		}
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CheckSchTimeAbnlForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void CheckSchTimeAbnlForEvaFdRule::ThrowRuleViolation(const Duty* duty, const Segment* currSeg, const Segment* nextSeg) const {
	
	//Duty内航段的计划时间重叠或顺序错误
	std::string msg = "Flight ({0:currAirline}{1:currFltNum} to {2:nextAirline}{3:nextFltNum}) Schedule time overlap or sequence error in duty period.";
	msg = StringUtils::Format(msg, currSeg->getAirline(), currSeg->getFlightNumber(), nextSeg->getAirline(), nextSeg->getFlightNumber());

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = CheckSchTimeAbnlForEvaFdRule::RuleFuncId;
	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySegNum();
	rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, duty->getPairingId());
		rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
	}
	else {
		_ruleViolation.SetLegalityMessage(const_cast<Duty*>(duty), msg, CheckSchTimeAbnlForEvaFdRule::RuleFuncId);
	}
	rv->startDTUtc = duty->getEndTimeUtcAct();
	rv->endDTUtc = duty->getEndTimeUtcAct();
	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("ruleId", StringUtils::lltos(rv->idRule)));
	rv->operation_result.insert(pair<string, string>("currAirline", currSeg->getAirline()));
	rv->operation_result.insert(pair<string, string>("currFltNum", currSeg->getFlightNumber()));
	rv->operation_result.insert(pair<string, string>("nextAirline", nextSeg->getAirline()));
	rv->operation_result.insert(pair<string, string>("nextFltNum", nextSeg->getFlightNumber()));
	_ruleViolation.AddRuleViolations(rv);
}
