/**
 * @file CalculateMaxDPByComplementForPRRuleParam.h
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
#include "CalculateMaxDPByComplementForPRRuleParam.h"
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

void CalculateMaxDPByComplementForPRRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "COMPOSITIONS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _compositions);
			}
		}
		else if (header == "REF COMPOSITION") {
			if (headeValue != RuleParamConstant::ALL) {
				_refComposition = headeValue;
			}
		}
		else if (header == "ADDITIONAL CREWS") {
			if (headeValue != RuleParamConstant::ALL) {
				_additionalCrews = headeValue;
			}
		}
		else if (header == "FLEETS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _fleets);
			}
		}
		else if (header == "FLIGHTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _flights);
			}
		}
		else if (header == "DEPS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _deps);
			}
		}
		else if (header == "ARRS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _arrs);

			}
		}
		else if (header == "MAX DP") {
			if (headeValue != RuleParamConstant::ALL) {
				_maxDP = hhmmStrToMinutes(headeValue);

			}
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CalculateMaxDPByComplementForPRRuleParam::MatchRule(Duty* duty, const int minComposition, const int dutyComposition) const {

	if (!MatchCompositions(duty))
		return false;

	if (!MatchRefComposition(duty, minComposition, dutyComposition))
		return false;

	if (!MatchFleets(duty))
		return false;

	if (!MatchFlightNumbers(duty))
		return false;

	if (!MatchAirports(duty))
		return false;

	return true;
}

bool CalculateMaxDPByComplementForPRRuleParam::MatchCompositions(Duty* duty) const {
	if (_compositions.empty() || _compositions[0] == "" || _compositions[0] == "*")
		return true;

	string strComplement = duty->getCompositionName();
	if (strComplement == "")
	{
		strComplement = DutyUtils::GetCompositionByDutyFor3(duty, this->GetRule()->GetDataContext());
		//strComplement = this->pairingCompositionCalculator->calculatePairingCompositionForPilotR5_3007(duty);
		duty->setCompositionName(strComplement);
	}

	return find(_compositions.begin(), _compositions.end(), strComplement) != _compositions.end();
}

bool CalculateMaxDPByComplementForPRRuleParam::MatchRefComposition(Duty* duty, const int minCommposition, const int dutyComposition) const {
	if (_refComposition.empty() || _refComposition == "*" || _refComposition == "")
		return true;

	if (_additionalCrews.empty() || _additionalCrews == "*" || _additionalCrews == "")
		return true;


	return dutyComposition - minCommposition == stoi(_additionalCrews);
}

bool CalculateMaxDPByComplementForPRRuleParam::MatchFleets(const Duty* duty) const {
	if (_fleets.empty() || _fleets[0] == "" || _fleets[0] == "*")
		return true;

	const auto& segments = duty->getSegmentsRead();
	for (const auto& segment : segments) {
		if (find(_fleets.begin(), _fleets.end(), segment->getFleetCD()) == _fleets.end())
			return false;
	}
	return true;
}

bool CalculateMaxDPByComplementForPRRuleParam::MatchFlightNumbers(const Duty* duty) const {
	if (_flights.empty() || _flights[0] == "" || _flights[0] == "*")
		return true;

	const auto& segments = duty->getSegmentsRead();
	for (const auto& segment : segments) {
		if (find(_flights.begin(), _flights.end(), segment->getFlightNumber()) == _flights.end())
			return false;
	}
	return true;
}

bool CalculateMaxDPByComplementForPRRuleParam::MatchAirports(const Duty* duty) const {
	if (!_deps.empty() && _deps[0] != "*" && _deps[0] != "" &&
		find(_deps.begin(), _deps.end(), duty->getDepStationRead()) == _deps.end())
		return false;

	if (!_arrs.empty() && _arrs[0] != "*" && _arrs[0] != "" &&
		find(_arrs.begin(), _arrs.end(), duty->getDepStationRead()) == _arrs.end())
		return false;

	return true;
}
