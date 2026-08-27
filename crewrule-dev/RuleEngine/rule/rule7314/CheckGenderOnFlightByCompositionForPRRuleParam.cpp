/**
 * @file CheckGenderOnFlightByCompositionForPRRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CheckGenderOnFlightByCompositionForPRRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/SegmentUtils.h"
#include "index/TmProgramIndex.h"
#include "index/TmFootprintIndex.h"


using namespace std;

void CheckGenderOnFlightByCompositionForPRRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "PAIRING BASES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _pairingBases);
			}
		}
		else if (header == "FLIGHT FLEETS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _flightFleets);
			}
		}
		else if (header == "ACTING RANKS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _actingRanks);
			}
		}
		else if (header == "FLIGHT COMPOSITIONS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _flightCompositions);
			}
		}
		else if (header == "MIN MALE CREWS") {
			if (headeValue != RuleParamConstant::ALL) {
				_minMalCrews = headeValue;
				if (!_minMalCrews.empty() && _minMalCrews != "*")
					_minMalCrewsNumber = stoi(headeValue);
			}
		}
		else if (header == "MAX MALE CREWS") {
			if (headeValue != RuleParamConstant::ALL) {
				_maxMalCrews = headeValue;
				if (!_maxMalCrews.empty() && _maxMalCrews != "*")
					_maxMalCrewsNumber = stoi(headeValue);
			}
		}
		else if (header == "LAYOVER") {
			if (headeValue != RuleParamConstant::ALL) {
				_layover = headeValue;
			}
		}
		else if (header == "EVEN DISTRIBUTION") {
			if (headeValue != RuleParamConstant::ALL) {
				_evenDistribution = headeValue;
			}
		}
		else if (header == "EVEN ON GENDER") {
			if (headeValue != RuleParamConstant::ALL) {
				_evenOnGender = headeValue;
			}
		}
		else if (header == "INCLUDE DHD") {
			if (headeValue != RuleParamConstant::ALL) {
				_includeDHD = headeValue;
			}
		}
		else if (header == "IS TOTAL EVEN") {
			if (headeValue != RuleParamConstant::ALL) {
				_isTotalEven = headeValue;
			}
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CheckGenderOnFlightByCompositionForPRRuleParam::MatchPairing(const Pairing* pairing) const {
	if (!_pairingBases.empty() && _pairingBases[0] != "" && _pairingBases[0] != "*" &&
		find(_pairingBases.begin(), _pairingBases.end(), pairing->getBase()) == _pairingBases.end())
		return false;

	if (_layover == "Y" && pairing->getDutyVec().size() < 2)
		return false;

	return true;
}

bool CheckGenderOnFlightByCompositionForPRRuleParam::MatchFleets(const string fleet) const {
	if (!_flightFleets.empty() && _flightFleets[0] != "" && _flightFleets[0] != "*" &&
		find(_flightFleets.begin(), _flightFleets.end(), fleet) == _flightFleets.end())
		return false;

	return true;
}

bool CheckGenderOnFlightByCompositionForPRRuleParam::MatchComposition(const string composition) const {
	if (_flightCompositions.empty() || _flightCompositions[0] == "" || _flightCompositions[0] == "*")
		return true;

	if (composition.empty())
		return false;

	return find(_flightCompositions.begin(), _flightCompositions.end(), composition) != _flightCompositions.end();
}

bool CheckGenderOnFlightByCompositionForPRRuleParam::MatchActingRank(const string actingRank) const {
	if (_actingRanks.empty() || _actingRanks[0] == "" || _actingRanks[0] == "*" || find(_actingRanks.begin(), _actingRanks.end(), actingRank) != _actingRanks.end())
		return true;
	return false;
}

int CheckGenderOnFlightByCompositionForPRRuleParam::GetCrewNumberByActingRank(const Segment* s) const {
	int crewNumber = 0;
	map<string, int> rankMap;
	auto iterFlight = this->GetRule()->GetDataContext()->flightIdMap.find(s->getDBId());
	if (iterFlight != this->GetRule()->GetDataContext()->flightIdMap.end()) {
		if (iterFlight->second == nullptr) {
			return crewNumber;
		}
		else {
			auto iter = iterFlight->second->getPlanComposition().begin();
			while (iter != iterFlight->second->getPlanComposition().end()) {
				if (this->GetRule()->GetDataContext()->scenario.airline == "CA" && (iter->first == "RO" || iter->first == "OVER")) {
					iter++;
					continue;
				}
				if (this->GetRule()->GetDataContext()->rankMap[iter->first].isMustCrewRank) {
					rankMap[iter->first] += iter->second;
				}
				iter++;
			}
		}

	}

	if (rankMap.empty())
		return crewNumber;
	
	for (auto iter = rankMap.begin(); iter != rankMap.end(); iter++) {
		if (_actingRanks.empty() || _actingRanks[0] == "" || _actingRanks[0] == "*" || find(_actingRanks.begin(), _actingRanks.end(), iter->first) != _actingRanks.end())
			crewNumber += iter->second;
		
	}
	return crewNumber;

}