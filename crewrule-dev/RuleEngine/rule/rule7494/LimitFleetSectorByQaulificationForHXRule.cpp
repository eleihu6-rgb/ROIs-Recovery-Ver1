/**
 * @file LimitFleetSectorByQaulificationForHXRule.cpp
 * @brief
**/

#include "../RuleSytem.h"
#include "LimitFleetSectorByQaulificationForHXRule.h"
#include "Utility.h"
#include "../utils/StringUtils.h"
#include <UtilFunc.h>

using namespace std;

void LimitFleetSectorByQaulificationForHXRule::ParseParam(const InputType& input) {
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitFleetSectorByQaulificationForHXRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

	if (!_ruleParams.empty()) {
		return;
	}

	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitFleetSectorByQaulificationForHXRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

unordered_map<time_t, shared_ptr<CREW_MANDAY_BASIC>> LimitFleetSectorByQaulificationForHXRule::GetMandayMap(const shared_ptr<CREW>& crew) const {
	unordered_map<time_t, shared_ptr<CREW_MANDAY_BASIC>> mandayMap;
	if (crew == nullptr) {
		return mandayMap;
	}

	if (crew->division == "P") {
		for (const auto& manday : crew->mandayFdList) {
			mandayMap[manday->dateLoc] = manday;
		}
	}
	else {
		for (const auto& manday : crew->mandayCcAmList) {
			mandayMap[manday->dateLoc] = manday;
		}
	}
	return mandayMap;
}

int LimitFleetSectorByQaulificationForHXRule::CountMatchedFleetSectorsInRange(
	const unordered_map<time_t, shared_ptr<CREW_MANDAY_BASIC>>& mandayMap,
	time_t startUtc, time_t endUtc,
	const LimitFleetSectorByQaulificationForHXRuleParam& ruleParam) const {
	if (startUtc > endUtc) {
		return 0;
	}

	int total = 0;
	for (const auto& pair : mandayMap) {
		const auto& manday = pair.second;
		if (manday == nullptr) {
			continue;
		}
		if (manday->crewDateUtc < startUtc || manday->crewDateUtc > endUtc) {
			continue;
		}

		for (const auto& fleetPair : manday->operating_fleets) {
			if (ruleParam.MatchFleet(fleetPair.first)) {
				total += fleetPair.second;
			}
		}
	}
	return total;
}

bool LimitFleetSectorByQaulificationForHXRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;
	const auto crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	if (crew == nullptr) {
		return true;
	}

	time_t checkedStartTime = this->_dbData->scenario.startDtUTC;
	time_t checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;
	if (_application != ROSTER_OPTIMIZER) {
		checkedStartTime = rosters.front()->actStrUtc;
		checkedEndTime = rosters.back()->restStrUtc;
	}

	const auto mandayMap = GetMandayMap(crew);
	for (const auto& ruleParam : _ruleParams) {
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
			continue;
		}

		_ruleViolation.SetRuleParam(ruleParam);
		for (const auto& qualification : crew->qualificationList) {
			if (qualification == nullptr || !ruleParam.MatchQualification(qualification)) {
				continue;
			}

			const time_t windowStartUtc = qualification->issuedUtc;
			const time_t windowEndUtc = qualification->issuedUtc + static_cast<time_t>(ruleParam._afterQualEffDtDays) * 24 * 3600;
			const int sectorsInWindow = CountMatchedFleetSectorsInRange(mandayMap, windowStartUtc, windowEndUtc, ruleParam);
			if (sectorsInWindow >= ruleParam._minFlySectors) {
				continue;
			}

			ThrowRuleViolation(crew, qualification->qual, windowStartUtc, windowEndUtc, sectorsInWindow, ruleParam);
			passAllRule = false;
			if (!IsCheckAllRule()) {
				return false;
			}
		}
	}

	return passAllRule;
}

void LimitFleetSectorByQaulificationForHXRule::ThrowRuleViolation(
	shared_ptr<CREW> crew,
	const std::string& qualification,
	const time_t windowStartUtc,
	const time_t windowEndUtc,
	const int sectorsInWindow,
	const LimitFleetSectorByQaulificationForHXRuleParam& ruleParam) const {
	string targetFleets = StringUtils::Join(ruleParam._flightFleets, "|");
	if (targetFleets.empty()) {
		targetFleets = "*";
	}

	string msg = "Crew qualification ({0:qualification}) has only completed {1:actual}/{2:required} sectors on fleet ({3:fleets}) from {4:start} to {5:end}.";
	msg = StringUtils::Format(msg,
		qualification,
		sectorsInWindow,
		ruleParam._minFlySectors,
		targetFleets,
		utcToUtcString(windowStartUtc),
		utcToUtcString(windowEndUtc));

	_ruleViolation.SetLegalityMessage(crew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = crew->idCrew;
	rv->startDTUtc = windowStartUtc;
	rv->endDTUtc = windowEndUtc;
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(std::make_pair("qualification", qualification));
	rv->operation_result.insert(std::make_pair("required_fleets", targetFleets));
	rv->operation_result.insert(std::make_pair("sectors_in_window", std::to_string(sectorsInWindow)));
	rv->operation_result.insert(std::make_pair("min_fly_sectors", std::to_string(ruleParam._minFlySectors)));
	_ruleViolation.AddRuleViolations(rv);
}
