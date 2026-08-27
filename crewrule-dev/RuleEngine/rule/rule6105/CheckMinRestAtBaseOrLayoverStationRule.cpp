/**
 * @file CheckMinRestAtBaseOrLayoverStationRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckMinRestAtBaseOrLayoverStationRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

bool CheckMinRestAtBaseOrLayoverStationRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}
	vector<Duty*> duties = DutyUtils::GetDuties(rosters, this->_dbData);

	map<long long, long> mapCallinSBY_FDPMins;
	for (auto& roster : rosters) {
		if (roster->pairing != nullptr && roster->callinSBY_FDPMins > 0) {
			mapCallinSBY_FDPMins.insert(std::make_pair(roster->pairId, roster->callinSBY_FDPMins));
		}
	}

	return CheckRule(duties, mapCallinSBY_FDPMins);
}

bool CheckMinRestAtBaseOrLayoverStationRule::CheckRule(const Pairing* pairing) const {
	if (this->_ruleParams.empty()) {
		return true;
	}
	map<long long, long> mapCallinSBY_FDPMins;
	return CheckRule(pairing->getDutyVec(), mapCallinSBY_FDPMins);
}

bool CheckMinRestAtBaseOrLayoverStationRule::CheckRule(const Duty* duty) const {
	if (this->_ruleParams.empty()) {
		return true;
	}
	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	map<long long, long> mapCallinSBY_FDPMins;
	return CheckRule(duties, mapCallinSBY_FDPMins);
}

bool CheckMinRestAtBaseOrLayoverStationRule::CheckRule(const vector<Duty*>& duties, const map<long long, long>& mapCallinSBY_FDPMins) const {
	if (duties.empty()) {
		return true;
	}

	std::string base{}; // left blank will use the context find pairing id from duty or segment
	if (this->IsPairingOptimizerModel()) {
		base = duties.front()->getDepStationRead(); // PO can't get pairing from either duty or segments
	}

	bool passAllRule = true;
	for (std::size_t i = 0; i < duties.size(); i++) {
		Duty* currDuty = duties.at(i);
		Duty* nextDuty = (i + 1) >= duties.size() ? nullptr : duties.at(i + 1);

		for (const auto& ruleParam : _ruleParams) {
			_ruleViolation.SetRuleParam(ruleParam);

			bool valid = CheckRule(currDuty, nextDuty, base, ruleParam, mapCallinSBY_FDPMins);
			if (!valid) {
				passAllRule = false;
				ThrowRuleViolation(currDuty);
				if (!this->IsCheckAllRule()) {
					break;
				}
			}
		}
	}
	return passAllRule;
}

bool CheckMinRestAtBaseOrLayoverStationRule::CheckRule(const Duty* currDuty, const Duty* nextDuty, const std::string& base,
	const MinRestAtBaseOrLayoverStationRuleParam& ruleParam, const map<long long, long>& mapCallinSBY_FDPMins) const {
	
	if (!ruleParam.MatchRule(*currDuty, mapCallinSBY_FDPMins)) {
		return true;
	}

	int restDiscretionMinutes = 0;
	if (currDuty->supportDiscretionType(DiscretionType::REST)) {
		restDiscretionMinutes = this->_dbData->getManualDiscretion(DiscretionType::REST);
	}

	if (ruleParam.MatchHomeBase(*currDuty, base)) {
		if (!ruleParam.CheckMinRestAtBase(currDuty, nextDuty, restDiscretionMinutes)) {
			_ruleViolation.SetParam("minRest", StringUtils::itos(*ruleParam._minRestAtBase));
			_ruleViolation.SetParam("actualRest", StringUtils::itos(currDuty->getActualRest()));
			_ruleViolation.SetParam("restDiscretion", StringUtils::itos(restDiscretionMinutes));
			return false;
		}
	}
	else if (ruleParam.MatchLayoverStation(*currDuty)) {
		if (!ruleParam.CheckMinRestAtLayover(currDuty, nextDuty, restDiscretionMinutes)) {
			_ruleViolation.SetParam("minRest", StringUtils::itos(*ruleParam._minRestAtLayover));
			_ruleViolation.SetParam("actualRest", StringUtils::itos(currDuty->getActualRest()));
			_ruleViolation.SetParam("restDiscretion", StringUtils::itos(restDiscretionMinutes));
			return false;
		}
	}
	return true;
}

void CheckMinRestAtBaseOrLayoverStationRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(MinRestAtBaseOrLayoverStationRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(MinRestAtBaseOrLayoverStationRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void CheckMinRestAtBaseOrLayoverStationRule::ThrowRuleViolation(const Duty* duty) const {
	string minRest = _ruleViolation.GetParam("minRest");
	string actualRest = _ruleViolation.GetParam("actualRest");
	string restDiscretion = _ruleViolation.GetParam("restDiscretion");

	std::string msg = "Actual rest({ 0:actualRest }) is less than the minimal rest required({ 1:minRest }).";
	msg = StringUtils::Format(msg, actualRest.empty() ? "-1" : TimeUtils::MinutesTohhmm(std::stoi(actualRest)),
		minRest.empty() ? "-1" : TimeUtils::MinutesTohhmm(std::stoi(minRest)));

	if (!restDiscretion.empty() && std::stoi(restDiscretion) > 0) {
		msg = "Actual rest({ 0:actualRest }) is less than the reduced minimal rest({ 1:minRest } - {2:restDiscretion}).";
		msg = StringUtils::Format(msg, actualRest.empty() ? "-1" : TimeUtils::MinutesTohhmm(std::stoi(actualRest)),
			minRest.empty() ? "-1" : TimeUtils::MinutesTohhmm(std::stoi(minRest)),
			restDiscretion.empty() ? "-1" : TimeUtils::MinutesTohhmm(std::stoi(restDiscretion)));
	}

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = CheckMinRestAtBaseOrLayoverStationRule::RuleFuncId;
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
		_ruleViolation.SetLegalityMessage(const_cast<Duty*>(duty), msg, CheckMinRestAtBaseOrLayoverStationRule::RuleFuncId);
	}
	rv->startDTUtc = duty->getEndTimeUtcAct();
	rv->endDTUtc = duty->getEndTimeUtcAct() + (actualRest.empty() ?  0 : std::stoi(actualRest)) * 60;
	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("ruleId", StringUtils::lltos(rv->idRule)));
	rv->operation_result.insert(pair<string, string>("actualRest", actualRest));
	rv->operation_result.insert(pair<string, string>("minRest", minRest));
	_ruleViolation.AddRuleViolations(rv);
}

