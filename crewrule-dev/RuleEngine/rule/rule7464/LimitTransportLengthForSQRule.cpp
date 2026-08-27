/**
 * @file LimitTransportLengthForSQRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-17
**/

#include "../RuleSytem.h"
#include "LimitTransportLengthForSQRule.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/TimeUtils.h"

bool LimitTransportLengthForSQRule::CheckRule(const Pairing* pairing) const {
	return CheckRule(pairing->getDutyVec());
}

bool LimitTransportLengthForSQRule::CheckRule(const Duty* duty) const {
	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	return CheckRule(duties);
}

bool LimitTransportLengthForSQRule::CheckRule(const vector<Duty*>& duties) const {
	if (_ruleParams.empty()) {
		return true;
	}

	bool passAllRule = true;
	for (const auto& ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(ruleParam);

        for (auto& duty : duties) {
			bool valid = CheckRule(duty, ruleParam);
			if (!valid) {
				passAllRule = false;
				if (!this->IsCheckAllRule()) {
					return passAllRule;
                }
			}
		}

	}
	return passAllRule;
}

bool LimitTransportLengthForSQRule::CheckRule(const Duty* duty, const LimitTransportLengthForSQRuleParam& ruleParam) const {
	bool valid = true;
	if (!ruleParam.MatchDuty(duty)) {
		return true;
	}
    for (auto& segment : duty->getSegmentsRead()) {
		if (!ruleParam.MatchParam(segment)) {
			continue;
		}

		if (!ruleParam.IsAllowedFlightRoute(segment)) {
			valid = false;
			if (!this->IsCheckAllRule()) {
				return valid;
			}
			ThrowRouteNotAllowedViolation(segment, ruleParam);
			continue;
		}

		int actDurationMinutes = static_cast<int>(segment->getEndTimeUtcAct() - segment->getStartTimeUtcAct()) / 60;
		if (actDurationMinutes > ruleParam._maxTransportLengthMinutes) {
			valid = false;
			if (!this->IsCheckAllRule()) {
				return valid;
			}
			ThrowRuleViolation(actDurationMinutes, segment, ruleParam);
		}
	}
	return valid;
}

void LimitTransportLengthForSQRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitTransportLengthForSQRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitTransportLengthForSQRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitTransportLengthForSQRule::ThrowRuleViolation(const int actTransportLength, const Segment* segment, const LimitTransportLengthForSQRuleParam& ruleParam) const {
	std::string msg = "Transport period ({0:actTransportLength}) is more than the limitation ({1:maxTransportLength}).";
	msg = StringUtils::Format(msg, TimeUtils::MinutesTohhmm(actTransportLength), ruleParam._maxTransportLength);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = LimitTransportLengthForSQRule::RuleFuncId;
	rv->pairingId = segment->getPairingId();
	rv->dutySequenceNumber = segment->getDutySeq();
	rv->segmentId = segment->getDBId();
	rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		if (this->_dbData != nullptr) {
			const int crewIndex = _ruleViolation.GetRuleLegality()->crewIndex;
			if (crewIndex >= 0 && crewIndex < static_cast<int>(this->_dbData->crewList.size())) {
				SharedPtr<CREW> ppCrew = this->_dbData->crewList[crewIndex];
				if (ppCrew != nullptr) {
					const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, segment->getPairingId());
					rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
					rv->crewId = ppCrew->idCrew;
					_ruleViolation.SetLegalityMessage(ppCrew, msg);
				}
			}
		}
	}
	else {
		_ruleViolation.SetLegalityMessage(const_cast<Segment*>(segment), msg);
	}
	rv->startDTUtc = segment->getStartTimeUtcAct();
	rv->endDTUtc = segment->getEndTimeUtcAct();
	rv->violation_msg = msg;

	_ruleViolation.AddRuleViolations(rv);
}

void LimitTransportLengthForSQRule::ThrowRouteNotAllowedViolation(const Segment* segment, const LimitTransportLengthForSQRuleParam& ruleParam) const {
	(void)ruleParam;
	std::string route = segment->getDepStationRead() + "-" + segment->getArrStationRead();
	std::string msg = "Transport route ({0:route}) is not in the allowed list.";
	msg = StringUtils::Format(msg, route);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = LimitTransportLengthForSQRule::RuleFuncId;
	rv->pairingId = segment->getPairingId();
	rv->dutySequenceNumber = segment->getDutySeq();
	rv->segmentId = segment->getDBId();
	rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		if (this->_dbData != nullptr) {
			const int crewIndex = _ruleViolation.GetRuleLegality()->crewIndex;
			if (crewIndex >= 0 && crewIndex < static_cast<int>(this->_dbData->crewList.size())) {
				SharedPtr<CREW> ppCrew = this->_dbData->crewList[crewIndex];
				if (ppCrew != nullptr) {
					const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, segment->getPairingId());
					rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
					rv->crewId = ppCrew->idCrew;
					_ruleViolation.SetLegalityMessage(ppCrew, msg);
				}
			}
		}
	}
	else {
		_ruleViolation.SetLegalityMessage(const_cast<Segment*>(segment), msg);
	}
	rv->startDTUtc = segment->getStartTimeUtcAct();
	rv->endDTUtc = segment->getEndTimeUtcAct();
	rv->violation_msg = msg;

	_ruleViolation.AddRuleViolations(rv);
}
