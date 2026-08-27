/**
 * @file CheckMaxLayoversInTripsForPairingRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2024-12-04
**/


#include <algorithm>

#include "../RuleSytem.h"
#include "CheckMaxLayoversInTripsForPairingRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "TimezoneUtils.h"

bool CheckMaxLayoversInTripsForPairingRule::CheckRule(const Pairing* pairing) const {


	bool passAllRule = true;
	if (pairing->getDutyVec().size() < 2)
		return true;
	const auto& duties = pairing->getDutyVec();
	for (const auto& ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(ruleParam);
		if (ruleParam._pairingBases.size() > 0 && ruleParam._pairingBases[0] != "*"
			&& find(ruleParam._pairingBases.begin(), ruleParam._pairingBases.end(), pairing->getBase()) == ruleParam._pairingBases.end())
			continue;
		if (ruleParam._effDate > 0 && pairing->getStartTimeLocAct() < ruleParam._effDate)
			continue;
		if (ruleParam._expDate > 0 && pairing->getStartTimeLocAct() > ruleParam._expDate)
			continue;
		int count = 0;
		for (size_t i = 0; i < duties.size() - 1; i++) {
			string station = duties[i]->getArrivalStation();
			if (ruleParam._layoverStations.size() > 0 && ruleParam._layoverStations[0] != "*" && find(ruleParam._layoverStations.begin(), ruleParam._layoverStations.end(), station) != ruleParam._layoverStations.end()) {
				++count;
			}
		}
		if (count > ruleParam._maxLayoverTimes) {
			passAllRule = false;
			if (this->_application == PAIRING_OPTIMIZER) {
				return false;
			}
			_ruleViolation.SetParam("limit", to_string(ruleParam._maxLayoverTimes));
			_ruleViolation.SetParam("stations", joinStrList(ruleParam._layoverStations, ","));
			_ruleViolation.SetParam("count", to_string(count));

			ThrowRuleViolation(pairing);
		}
	}
	
	return passAllRule;
}

void CheckMaxLayoversInTripsForPairingRule::ThrowRuleViolation(const Pairing* pairing) const {

	string count = _ruleViolation.GetParam("count");
	string limit = _ruleViolation.GetParam("limit");
	string stations = _ruleViolation.GetParam("stations");
	std::string msg = "The number of layover({0:count}) is exceed the limitation({1:limit}) at the station({2:stations})";
	msg = StringUtils::Format(msg, count, limit, stations);

	RULE_VIOLATION* rv = new RULE_VIOLATION();

	rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	rv->pairingId = pairing->getDbId();
	rv->startDTUtc = pairing->getStartTimeUtcAct();
	rv->endDTUtc = pairing->getEndTimeUtcAct();
	rv->violation_msg = msg;
	_ruleViolation.AddRuleViolations(rv);
}


void CheckMaxLayoversInTripsForPairingRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckMaxLayoversInTripsForPairingRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

}