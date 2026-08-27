#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "CalculateMaxFlightDutyPeriodForHXRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/SegmentUtils.h"
#include "../constant/Constants.h"

using namespace std;

void CalculateMaxFlightDutyPeriodForHXRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;

		if (header == "COMPOSITIONS")
			split(headeValue, '|', _compositions);
		else if (header == "RPT START")
			_rptStart = headeValue;
		else if (header == "RPT END")
			_rptEnd = headeValue;
		else if (header == "DUTY ASSIGNMENTS")
			split(headeValue, '|', _dutyAssignments);
		else if (header == "LANDING LOWER")
			_landingLower = atoi(headeValue.c_str());
		else if (header == "LANDING UPPER")
			_landingUpper = atoi(headeValue.c_str());
		else if (header == "MAX FDP")
			_maxFdp = TimeUtils::hhmmToMinutes(headeValue);
		else if (header == "PRECEDING REST RANGE") {
			_precedingRestRange = headeValue;
			parseRange(headeValue, _precedingRestLower, _precedingRestUpper);
		}
		else if (header == "SINGLE FLY SECTOR BLH RANGE") {
			_singleFlySectorBlhRange = headeValue;
			vector<string> splitstrs;
			split(headeValue.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_singleFlySectorBlhRangeLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_singleFlySectorBlhRangeUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "REST FACILITY") {
			_restFacilityStr = headeValue;
			_restFacility = (headeValue.empty() || headeValue == RuleParamConstant::ALL) ? -1 : atoi(headeValue.c_str());
		}
	}
}

void CalculateMaxFlightDutyPeriodForHXRuleParam::parseRange(const string& rangeStr, int& lower, int& upper) {
	size_t delimPos = rangeStr.find('-');
	if (delimPos != string::npos) {
		string lowerStr = rangeStr.substr(0, delimPos);
		string upperStr = rangeStr.substr(delimPos + 1);
		lower = TimeUtils::hhmmToMinutes(lowerStr);
		upper = TimeUtils::hhmmToMinutes(upperStr);
	}
	else {
		lower = upper = TimeUtils::hhmmToMinutes(rangeStr);
	}
}

bool CalculateMaxFlightDutyPeriodForHXRuleParam::MatchSingleFlySectorBlhRange(const Duty* duty) const {
	if (_singleFlySectorBlhRange.empty() || _singleFlySectorBlhRange == RuleParamConstant::ALL) {
		return true;
	}

	for (const auto& segment : duty->getSegmentsRead()) {
		if (segment->getIsOperating()) {
			if (segment->getBlkMinutes() >= _singleFlySectorBlhRangeLower && segment->getBlkMinutes() <= _singleFlySectorBlhRangeUpper) {
				return true;
			}
		}
	}
	return false;
}

bool CalculateMaxFlightDutyPeriodForHXRuleParam::MatchRestFacility(const Duty* duty) const {
	if (_restFacilityStr.empty() || _restFacilityStr == RuleParamConstant::ALL || _restFacility < 0) {
		return true;
	}

	for (const auto& segment : duty->getSegmentsRead()) {
		if (segment->getIsOperating()) {
			int restFacility = 0;
			if (SegmentUtils::GetRestFacility(restFacility, segment, this->GetRule()->GetDataContext())) {
				if (_restFacility == restFacility) {
					return true;
				}
			}
		}
	}
	return false;
}