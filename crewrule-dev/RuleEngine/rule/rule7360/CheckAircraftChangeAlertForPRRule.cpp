/**
 * @file CheckAircraftChangeAlertForPRRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-02-10
**/

#include "../RuleSytem.h"
#include "CheckAircraftChangeAlertForPRRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/SegmentUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "index/CrewRpRecencyIndex.h"

bool CheckAircraftChangeAlertForPRRule::CheckRule(const Pairing* pairing) const {
	if (this->_ruleParams.empty()) {
		return true;
	}
	bool passAllRule = true;
	for (auto& ruleParam : this->_ruleParams) {
		_ruleViolation.SetRuleParam(ruleParam);

		if (ruleParam._checkLevel == "P") {
			vector<Segment*> segments = const_cast<Pairing*>(pairing)->getSegments();
			bool valid = CheckRule(segments, ruleParam);
			if (!valid) {
				passAllRule = false;
				if (!IsCheckAllRule()) {
					return passAllRule;
				}
			}
		}
		else {
			for (auto& duty : pairing->getDutyVec()) {
				bool valid = CheckRule(duty->getSegmentsRead(), ruleParam);
				if (!valid) {
					passAllRule = false;
					if (!IsCheckAllRule()) {
						return passAllRule;
					}
				}
			}
		}
	}
	return passAllRule;
}

bool CheckAircraftChangeAlertForPRRule::CheckRule(const Duty* duty) const {
	if (this->_ruleParams.empty()) {
		return true;
	}
	bool passAllRule = true;
	for (auto& ruleParam : this->_ruleParams) {
		_ruleViolation.SetRuleParam(ruleParam);

		bool valid = CheckRule(duty->getSegmentsRead(), ruleParam);
		if (!valid) {
			passAllRule = false;
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}
	return passAllRule;
}

bool CheckAircraftChangeAlertForPRRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;
	for (auto& roster : rosters) {
		if (roster->pairing == nullptr) {
			continue;
		}

		bool valid = CheckRule(roster->pairing);
		if (!valid) {
			passAllRule = false;
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}

	return passAllRule;
}

bool CheckAircraftChangeAlertForPRRule::CheckRule(const vector<Segment*>& segments, const CheckAircraftChangeAlertForPRRuleParam& ruleParam) const {
	bool valid = true;
	for (int i = 0; i < (int)segments.size() - 1; i++) {
		Segment* currSegment = segments[i];
		Segment* nextSegment = segments[(size_t)i + 1];
		if (ruleParam.MatchParam(currSegment, nextSegment)) {
			if (SegmentUtils::IsAircraftChange(currSegment, nextSegment)) {
				valid = false;
				ThrowRuleViolation(currSegment, nextSegment, ruleParam);
			}
		}
	}
	return valid;
}

void CheckAircraftChangeAlertForPRRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckAircraftChangeAlertForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CheckAircraftChangeAlertForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void CheckAircraftChangeAlertForPRRule::ThrowRuleViolation(const Segment* currentSegment, const Segment* nextSegment, const CheckAircraftChangeAlertForPRRuleParam& ruleParam) const {
	string msg = "The tail number has been changed between the current flight ({0:currFlightNo}{1:currFlightTailNo}) and next flight ({2:nextFlightNo}{3:nextFlightTailNo}) .";
	msg = StringUtils::Format(msg, currentSegment->getFlightNumber(), 
		currentSegment->getTailNum().empty() ? "" : "/" + currentSegment->getTailNum(),
		nextSegment->getFlightNumber(), 
		nextSegment->getTailNum().empty() ? "" : "/" + nextSegment->getTailNum());

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = CheckAircraftChangeAlertForPRRule::RuleFuncId;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, currentSegment->getPairingId());
		rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
	}
	rv->pairingId = currentSegment->getPairingId();
	rv->dutySequenceNumber = currentSegment->getDutySeq();
	rv->startDTUtc = currentSegment->getStartTimeUtcAct();
	rv->endDTUtc = nextSegment->getEndTimeUtcAct();
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("currFlightNo", currentSegment->getFlightNumber()));
	rv->operation_result.insert(pair<string, string>("currFlightTailNo", currentSegment->getTailNum()));
	rv->operation_result.insert(pair<string, string>("nextFlightNo", nextSegment->getFlightNumber()));
	rv->operation_result.insert(pair<string, string>("nextFlightTailNo", nextSegment->getTailNum()));
	_ruleViolation.AddRuleViolations(rv);
}
