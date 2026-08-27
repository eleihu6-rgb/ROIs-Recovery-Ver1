/**
 * @file CheckMaxFlightDutyBySplitDutyRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckMaxFlightDutyBySplitDutyRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

bool CheckMaxFlightDutyBySplitDutyRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;

	for (auto& roster : rosters) {
		if (this->_application == ROSTER_OPTIMIZER && roster->source == "PA") {
			continue;
		}
		if (roster->pairing != nullptr) {
			bool valid = CheckRule(roster->pairing);
			if (!valid) {
				passAllRule = false;
				if (!this->IsCheckAllRule()) {
					break;
				}
			}
		}
	}
	return passAllRule;
}

bool CheckMaxFlightDutyBySplitDutyRule::CheckRule(const Pairing* pairing) const {
	if (this->_ruleParams.empty()) {
		return true;
	}
	return CheckRule(pairing->getDutyVec());
}

bool CheckMaxFlightDutyBySplitDutyRule::CheckRule(const Duty* duty) const {
	if (this->_ruleParams.empty()) {
		return true;
	}
	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	return CheckRule(duties);
}

bool CheckMaxFlightDutyBySplitDutyRule::CheckRule(const vector<Duty*>& duties) const {
	if (duties.empty()) {
		return true;
	}

	bool passAllRule = true;
	for (auto& duty : duties) {
		if (!RuleParams::GetInstancePtr()->isLongTransit(duty)) {
			//检查仅针对长中转Split Duty
			continue;
		}
		for (const auto& ruleParam : _ruleParams) {
			_ruleViolation.SetRuleParam(ruleParam);
			_ruleViolation.SetParam("maxFDPAfterTransit", ruleParam._maxFDPAfterTransit);
			_ruleViolation.SetParam("includeSplitDutyPeriodMinutesLower", StringUtils::itos(ruleParam._includeSplitDutyPeriodMinutesLower));
			_ruleViolation.SetParam("includeSplitDutyPeriodMinutesUpper", StringUtils::itos(ruleParam._includeSplitDutyPeriodMinutesUpper));
			_ruleViolation.SetParam("minSplitRest", ruleParam._minSplitRest);

			bool valid = CheckRule(duty, ruleParam);
			if (!valid) {
				passAllRule = false;
				if (!this->IsCheckAllRule()) {
					break;
				}
			}
		}
	}
	return passAllRule;
}

bool CheckMaxFlightDutyBySplitDutyRule::CheckRule(const Duty* duty, const MaxFlightDutyBySplitDutyRuleParam& ruleParam) const {
	bool valid = true;
	for (int i = 0; i < (int)(duty->getNumSegments()) - 1; i++) {
		Segment* currSegment = duty->getSegment(i);
		Segment* nextSegment = duty->getSegment(i + 1);
		long_transit* transit = RuleParams::GetInstancePtr()->getLongTransit(currSegment, nextSegment);
		if (transit == nullptr) {
			continue;
		}

		if (ruleParam.MatchParamByCheck(currSegment, nextSegment, transit, duty)) {
			int warnCode = ruleParam.CheckRule(currSegment, nextSegment, transit, duty);
			if ((warnCode & (int)MaxFlightDutyBySplitDutyRuleParam::WarnCode::MIN_FDP_AFTER_TRANSIT_WARN) == (int)MaxFlightDutyBySplitDutyRuleParam::WarnCode::MIN_FDP_AFTER_TRANSIT_WARN) {
				ThrowRuleViolationForMinFDPAfterTransit(duty);
				valid = false;
			}

			if ((warnCode & (int)MaxFlightDutyBySplitDutyRuleParam::WarnCode::MIN_SPLIT_REST_WARN) == (int)MaxFlightDutyBySplitDutyRuleParam::WarnCode::MIN_SPLIT_REST_WARN) {
				ThrowRuleViolationForMinRest(duty);
				valid = false;
			}
		}
	}
	return valid;
}

void CheckMaxFlightDutyBySplitDutyRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(MaxFlightDutyBySplitDutyRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(MaxFlightDutyBySplitDutyRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void CheckMaxFlightDutyBySplitDutyRule::ThrowRuleViolationForMinFDPAfterTransit(const Duty* duty) const {
	string fdpAfterTransitMinutes = _ruleViolation.GetParam("fdpAfterTransitMinutes");
	string maxFDPAfterTransit = _ruleViolation.GetParam("maxFDPAfterTransit");
	
	std::string msg = "The flight duty period ({0:fdpAfterTransitMinutes}) after the split rest period exceeds the maximum allowable of {1:maxFDPAfterTransit} hours.";
	msg = StringUtils::Format(msg, fdpAfterTransitMinutes, maxFDPAfterTransit);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = CheckMaxFlightDutyBySplitDutyRule::RuleFuncId;
	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySegNum();
	rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
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
		_ruleViolation.SetLegalityMessage(const_cast<Duty*>(duty), msg, CheckMaxFlightDutyBySplitDutyRule::RuleFuncId);
	}
	rv->startDTUtc = duty->getEndTimeUtcAct();
	rv->endDTUtc = duty->getEndTimeUtcAct();
	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("ruleId", StringUtils::lltos(rv->idRule)));
	rv->operation_result.insert(pair<string, string>("fdpAfterTransitMinutes", fdpAfterTransitMinutes));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckMaxFlightDutyBySplitDutyRule::ThrowRuleViolationForMinRest(const Duty* duty) const {
	int includeSplitDutyPeriodMinutesLower = StringUtils::stoi(_ruleViolation.GetParam("includeSplitDutyPeriodMinutesLower"), 0);
	int includeSplitDutyPeriodMinutesUpper = StringUtils::stoi(_ruleViolation.GetParam("includeSplitDutyPeriodMinutesUpper"), 0);
	string includeSplitDutyPeriodRanges = TimeUtils::MinutesTohhmm(includeSplitDutyPeriodMinutesLower) + "-" + TimeUtils::MinutesTohhmm(includeSplitDutyPeriodMinutesUpper - 1);
	string minSplitRest = _ruleViolation.GetParam("minSplitRest");

	std::string msg = "The split duty rest period that overlaps {0:includeSplitDutyPeriodRanges} must be at least {1:minSplitRest} hours.";
	msg = StringUtils::Format(msg, includeSplitDutyPeriodRanges, minSplitRest);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = CheckMaxFlightDutyBySplitDutyRule::RuleFuncId;
	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySegNum();
	rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
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
		_ruleViolation.SetLegalityMessage(const_cast<Duty*>(duty), msg, CheckMaxFlightDutyBySplitDutyRule::RuleFuncId);
	}
	rv->startDTUtc = duty->getEndTimeUtcAct();
	rv->endDTUtc = duty->getEndTimeUtcAct();
	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("ruleId", StringUtils::lltos(rv->idRule)));
	rv->operation_result.insert(pair<string, string>("includeSplitDutyPeriodRanges", includeSplitDutyPeriodRanges));
	rv->operation_result.insert(pair<string, string>("minSplitRest", minSplitRest));
	_ruleViolation.AddRuleViolations(rv);
}