#include "RuleEngine.h"
#include "Utility.h"

#include <time.h>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
// #include "orlog.h"
#include <OrLog.h>
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"

namespace {

std::unordered_set<std::string> collectFlightFleets(const std::vector<Segment*>& segments,
													std::set<std::string>* allFlightFleetsForMsg) {
	std::unordered_set<std::string> flightFleets;
	for (const auto* segment : segments) {
		const auto& assignment = segment->getAssignment();
		if (assignment != "OPR" && assignment != "FLY")
			continue;

		const auto& fleet = segment->getFleetCD();
		if (allFlightFleetsForMsg)
			allFlightFleetsForMsg->insert(fleet);
		flightFleets.insert(fleet);
	}
	return flightFleets;
}

}  // namespace

LegalityChecker::FleetMixCache LegalityChecker::buildFleetMixCache(const vector<DBRule>& rules) {
	FleetMixCache cache;
	cache.allowedSets.reserve(rules.size());

	for (const auto& singleRule : rules) {
		if (singleRule.tableNum != 2)
			continue;

		string strFleets = "*";
		for (const auto& [key, value] : singleRule.params) {
			if (strToUpper(key) == "ALLOWABLE_FLEET_MIX") {
				strFleets = value;
				break;
			}
		}

		vector<string> fleets;
		split(strFleets, '|', fleets);

		std::unordered_set<std::string> fleetSet;
		for (const auto& rawFleet : fleets) {
			const auto fleet = trim(rawFleet);
			if (!fleet.empty())
				fleetSet.insert(fleet);
		}

		if (fleetSet.size() == 1 && *(fleetSet.begin()) == "*") {
			cache.hasWildcard = true;
			cache.initialized = true;
			return cache;
		}

		if (!fleetSet.empty()) {
			for (const auto& fleet : fleetSet)
				cache.listedFleets.insert(fleet);
			cache.allowedSets.push_back(std::move(fleetSet));
		}
	}

	cache.initialized = true;
	return cache;
}

const LegalityChecker::FleetMixCache& LegalityChecker::getFleetMixDutyCache(const vector<DBRule>& rules) {
	if (!_fleetMixDutyCache.initialized) {
		std::lock_guard<std::mutex> lock(_fleetMixCacheMutex);
		if (!_fleetMixDutyCache.initialized)
			_fleetMixDutyCache = buildFleetMixCache(rules);
	}
	return _fleetMixDutyCache;
}

const LegalityChecker::FleetMixCache& LegalityChecker::getFleetMixPairingCache(const vector<DBRule>& rules) {
	if (!_fleetMixPairingCache.initialized) {
		std::lock_guard<std::mutex> lock(_fleetMixCacheMutex);
		if (!_fleetMixPairingCache.initialized)
			_fleetMixPairingCache = buildFleetMixCache(rules);
	}
	return _fleetMixPairingCache;
}

bool LegalityChecker::isAllowedFleetMix(const std::unordered_set<std::string>& flightFleets, const FleetMixCache& allowedMix) {
	// New behavior: fleets not present in any allowable list are still allowed as long as
	// the duty/pairing contains only a single fleet (i.e., not mixed).
	if (flightFleets.size() <= 1)
		return true;

	if (allowedMix.hasWildcard)
		return true;

	// Any fleet that is not listed anywhere cannot be mixed with any other fleet.
	for (const auto& fleet : flightFleets) {
		if (allowedMix.listedFleets.find(fleet) == allowedMix.listedFleets.end())
			return false;
	}

	for (const auto& allowedSet : allowedMix.allowedSets) {
		bool allFound = true;
		for (const auto& fleet : flightFleets) {
			if (allowedSet.find(fleet) == allowedSet.end()) {
				allFound = false;
				break;
			}
		}
		if (allFound)
			return true;
	}

	return false;
}

//segments：同一个Pairing下所有Segment
bool LegalityChecker::checkFleetCombination(vector<Segment *>& segments, const vector<DBRule>& rules, const SharedPtr<ROSTER> roster){

	if (segments.size() == 1)
		return true;

	if (rules.empty())
		return true;

	if (roster != nullptr) {
		if (string(rules[0].classType) == "P") return true;
	}
	else {
		if (string(rules[0].classType) == "R") return true;
	}
	//if (string(rules[0].classType) == "P" && roster != nullptr) {
	//	return true;
	//}

	//if (string(rules[0].classType) == "R" && roster == nullptr) {
	//	return true;
	//}

	std::set<std::string> notfleetSet;
	const auto flightFleets = collectFlightFleets(segments, &notfleetSet);
	const auto& allowedMix = getFleetMixPairingCache(rules);
	const bool bReturn = isAllowedFleetMix(flightFleets, allowedMix);

	if (!bReturn)
	{
		if (this->_application == PAIRING_OPTIMIZER)
			return false;

		string notfleet;
		for (std::set<std::string>::iterator it = notfleetSet.begin(); it != notfleetSet.end(); it++) {
			notfleet += *it + "/";
		}
		notfleet = notfleet.substr(0, notfleet.length() - 1);
		string errorMsg = "The segment fleets(" + notfleet + ") are not permitted by rule for All Situations in the pairing.";
		auto iterPairing = this->_dbData->pairingIdMap.find(segments[0]->getPairingId());
		if (iterPairing != this->_dbData->pairingIdMap.end()) {
			auto pairing = iterPairing->second;
			pairing->setViolationMessage(errorMsg);
			pairing->setLegality(false);
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->pairingId = pairing->getDbId();
			//rv->dutySequenceNumber = duty->getDutySegNum();
			rv->idRule = 2112;
			rv->startDTUtc = pairing->getStartTimeUtcAct();
			rv->endDTUtc = pairing->getEndTimeUtcAct();
			rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
			if (roster != nullptr) {
				rv->crewId = roster->idcrew;
				rv->rosterId = roster->rosterId;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
			}
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("notfleet", notfleet));
			rv->violation_msg = errorMsg;
			this->addRuleViolations(rv, rules.empty() ? NULL : &rules[0]);
		}
	}

	return bReturn;
}


//BUNK_SETTING
bool LegalityChecker::checkFleetCombination(Duty * duty, const vector<DBRule>& rules, const SharedPtr<ROSTER> roster)
{
	if (duty->getNumSegments() == 1)
		return true;

	if (rules.empty())
		return true;

	std::set<std::string> notfleetSet;
	const auto segments = duty->getSegments();
	const auto flightFleets = collectFlightFleets(segments, &notfleetSet);
	const auto& allowedMix = getFleetMixDutyCache(rules);
	const bool bReturn = isAllowedFleetMix(flightFleets, allowedMix);

	if (!bReturn)
	{
		if (this->_application == PAIRING_OPTIMIZER)
			return false;

		string notfleet;
		for (std::set<std::string>::iterator it = notfleetSet.begin(); it != notfleetSet.end(); it++) {
			notfleet += *it + "/";
		}
		notfleet = notfleet.substr(0, notfleet.length() - 1);
		string errorMsg = "The segment fleets(" + notfleet + ") are not permitted by rule for All Situations in the duty";
	
		duty->setViolationMessage(errorMsg);
		duty->setLegality(false);
		RULE_VIOLATION* rv = new RULE_VIOLATION();
		rv->pairingId = duty->getPairingId();
		rv->dutySequenceNumber = duty->getDutySegNum();
		rv->idRule = 2112;
		rv->startDTUtc = duty->getStartTimeUtcAct();
		rv->endDTUtc = duty->getEndTimeUtcAct();
		rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
		if (roster != nullptr) {
			rv->crewId = roster->idcrew;
			rv->rosterId = roster->rosterId;
			rv->type = VIOLATION_TYPE::CREW_VIOLATION;
		}
		//OP#1448提供message参数给gantt
		rv->operation_result.insert(pair<string, string>("notfleet", notfleet));
		rv->violation_msg = errorMsg;
		this->addRuleViolations(rv, rules.empty() ? NULL : &rules[0]);
	}

	return bReturn;
}

bool LegalityChecker::checkFleetCombination(const vector<Duty*>& duties, const vector<DBRule>& rules, const SharedPtr<ROSTER> roster) {
	
	bool passAllRules = true;
	// HO cabin crew特殊法规，fleet combination只由于duty内，不考虑duty之间的机型组合法规， 
	// TODO 后续考虑法规设计 duty内和duty间使用不同的规则
	if (this->_dbData->scenario.airline == "HO" && _dbData->scenario.division == "C")
		return true;

	if (rules.empty()) {
		return true;
	}
	if (roster != nullptr) {
		if (string(rules[0].classType) == "P") return true;
	}
	else {
		if (string(rules[0].classType) == "R") return true;
	}
	//if (string(rules[0].classType) == "P" && roster != nullptr) {
	//	return true;
	//}

	//if (string(rules[0].classType) == "R" && roster == nullptr) {
	//	return true;
	//}

	// 若频繁调用该函数，可能由于频繁构造析构vector，使得性能较差
	// 可以考虑声明为static，然后每次clear
	vector<Segment*> allSegs;
	std::size_t nsegs = 0;
	for (auto & duty : duties)
		nsegs += duty->getNumSegments();
	allSegs.reserve(nsegs);

	for (const auto& duty : duties) {
		allSegs.insert(allSegs.end(), duty->getSegmentsRead().begin(), duty->getSegmentsRead().end());
	}

	bool hasCheckMode = false;
	vector<DBRule> dutyRules;
	vector<DBRule> pairingRules;
	dutyRules.reserve(rules.size());
	pairingRules.reserve(rules.size());

	for (const auto& singleRule : rules) {
		if (singleRule.tableNum != 2)
			continue;

		string checkMode;
		for (const auto& [key, value] : singleRule.params) {
			if (key == "CHECK_MODE") {
				checkMode = value;
				hasCheckMode = true;
				break;
			}
		}
		if (!hasCheckMode)
			break;
		if (checkMode == "P") {
			pairingRules.push_back(singleRule);
		}
		else if (checkMode == "*") {
			dutyRules.push_back(singleRule);
			pairingRules.push_back(singleRule);
		}
		else {
			dutyRules.push_back(singleRule); // default "D"
		}
	}

	for (const auto& duty : duties) {
		const bool ok = hasCheckMode ? checkFleetCombination(duty, dutyRules, roster) : checkFleetCombination(duty, rules, roster);
		passAllRules = passAllRules && ok;
		if (!passAllRules && this->_application == PAIRING_OPTIMIZER)
			return false;
	}

	const bool pairingOk = hasCheckMode ? checkFleetCombination(allSegs, pairingRules, roster) : checkFleetCombination(allSegs, rules, roster);
	passAllRules = passAllRules && pairingOk;
	
	return passAllRules;
}

bool LegalityChecker::checkFleetCombination(RULE_LEGALITY* pCrew) {
	if (pCrew == nullptr || pCrew->crewIndex < 0)
	{
		return true;
	}

	bool isValid = true;

	auto& dbRules = this->_dbData->getRuleFunctions(RULES::BUNK_SETTING);
	map<long long, vector<DBRule>> ruleMap;
	for (auto& dbRule : dbRules) {
        ruleMap[dbRule.idRule].emplace_back(dbRule);
	}

	for (auto& pair : ruleMap) {
		auto& tmpDbRules = pair.second;

		vector<SharedPtr<ROSTER>>& rosterList = this->_dbData->crewList[pCrew->crewIndex]->rosterList;
		for (auto& roster : rosterList) {
			Pairing* p = roster->pairing;
			if (p == nullptr) continue;

			if (!checkFleetCombination(p->getDutyVec(), tmpDbRules, roster)) {
				isValid = false;
				if (this->_application == ROSTER_OPTIMIZER)
					return isValid;
			}
		}
	}

	return isValid;
}
