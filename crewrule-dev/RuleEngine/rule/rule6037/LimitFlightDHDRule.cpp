/**
 * @file LimitFlightDHDRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "LimitFlightDHDRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

bool LimitFlightDHDRule::CheckRule(const Pairing* pairing) const {
	return CheckRule(pairing->getDutyVec());
}

bool LimitFlightDHDRule::CheckRule(const Duty* duty) const {
	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	return CheckRule(duties);
}

bool LimitFlightDHDRule::CheckRule(const vector<Duty*>& duties) const {
	if (duties.empty()) {
		return true;
	}

	std::string base{}; // left blank will use the context find pairing id from duty or segment
	if (this->IsPairingOptimizerModel()) {
		base = duties.front()->getDepStationRead(); // PO can't get pairing from either duty or segments
	}

	bool passAllRule = true;
	bool next = true;
	for (auto& duty : duties) {
		for (const auto & ruleParam : _ruleParams) {
			_ruleViolation.SetRuleParam(ruleParam);
			_ruleViolation.SetParam("homeBase", ruleParam._strPairingBases);
			bool valid = CheckRule(next, duty, base, ruleParam);
			if (!valid) {
				passAllRule = false;
			}
			if (!next) {
				break;
			}
		}
	}
	return passAllRule;
}

bool LimitFlightDHDRule::CheckRule(bool& next, const Duty* duty, const std::string& base,
	const LimitFlightDHDRuleParam& ruleParam) const {
	bool valid = true;
	for (std::size_t i = 0; i < duty->getNumSegments(); i++) {
		Segment* segment = duty->getSegment(i);
		if (ruleParam.MatchParam(*segment, base)) {
			_ruleViolation.SetParam("airline", segment->getAirline());
			_ruleViolation.SetParam("flightNumber", segment->getFlightNumber());
			_ruleViolation.SetParam("domIntType", segment->getDomIntType());
			int warnCode = ruleParam.CheckParam(*segment);
			if ((warnCode & (int)LimitFlightDHDRuleParam::WarnCode::NOT_ALLOWED_DHD) == (int)LimitFlightDHDRuleParam::WarnCode::NOT_ALLOWED_DHD) {
				valid = false;
				ThrowNotAllowedRuleViolation(duty, segment);
			}
			if ((warnCode & (int)LimitFlightDHDRuleParam::WarnCode::MUST_DHD) == (int)LimitFlightDHDRuleParam::WarnCode::MUST_DHD) {
				valid = false;
				ThrowMustDHDRuleViolation(duty, segment);
			}
			next = false;
			break;
		}
	}
	return valid;
}

void LimitFlightDHDRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitFlightDHDRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitFlightDHDRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitFlightDHDRule::ThrowNotAllowedRuleViolation(const Duty* duty, const Segment* segment) const {
	string homeBase = _ruleViolation.GetParam("homeBase");
	string airline = _ruleViolation.GetParam("airline");
	string flightNumber = _ruleViolation.GetParam("flightNumber");
	string domIntType = _ruleViolation.GetParam("domIntType");

	std::string msg = "Flight ({0:airline}{1:flightNumber}, Dom/Int={2:domIntType}) cannot be a deadhead from home base ({3:homeBase}).";
	msg = StringUtils::Format(msg, airline, flightNumber, domIntType, homeBase);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = LimitFlightDHDRule::RuleFuncId;
	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySegNum();
	rv->segmentId = segment->getSegmentId();
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
		_ruleViolation.SetLegalityMessage(const_cast<Duty*>(duty), msg, LimitFlightDHDRule::RuleFuncId);
	}
	rv->startDTUtc = duty->getEndTimeUtcAct();
	rv->endDTUtc = duty->getEndTimeUtcAct();
	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("ruleId", StringUtils::lltos(rv->idRule)));
	rv->operation_result.insert(pair<string, string>("airline", airline));
	rv->operation_result.insert(pair<string, string>("flightNumber", flightNumber));
	rv->operation_result.insert(pair<string, string>("domIntType", domIntType));
	rv->operation_result.insert(pair<string, string>("homeBase", homeBase));
	_ruleViolation.AddRuleViolations(rv);
}

void LimitFlightDHDRule::ThrowMustDHDRuleViolation(const Duty* duty, const Segment* segment) const {
	string homeBase = _ruleViolation.GetParam("homeBase");
	string airline = _ruleViolation.GetParam("airline");
	string flightNumber = _ruleViolation.GetParam("flightNumber");
	string domIntType = _ruleViolation.GetParam("domIntType");

	std::string msg = "Flight ({0:airline}{1:flightNumber}, Dom/Int={2:domIntType}) must be a deadhead from home base ({3:homeBase}).";
	msg = StringUtils::Format(msg, airline, flightNumber, domIntType, homeBase);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = LimitFlightDHDRule::RuleFuncId;
	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySegNum();
	rv->segmentId = segment->getSegmentId();
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
		_ruleViolation.SetLegalityMessage(const_cast<Duty*>(duty), msg, LimitFlightDHDRule::RuleFuncId);
	}
	rv->startDTUtc = duty->getEndTimeUtcAct();
	rv->endDTUtc = duty->getEndTimeUtcAct();
	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("ruleId", StringUtils::lltos(rv->idRule)));
	rv->operation_result.insert(pair<string, string>("airline", airline));
	rv->operation_result.insert(pair<string, string>("flightNumber", flightNumber));
	rv->operation_result.insert(pair<string, string>("domIntType", domIntType));
	rv->operation_result.insert(pair<string, string>("homeBase", homeBase));
	_ruleViolation.AddRuleViolations(rv);
}
