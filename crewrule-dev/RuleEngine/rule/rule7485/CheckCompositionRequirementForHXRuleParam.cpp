#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "CheckCompositionRequirementForHXRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"

using namespace std;

void CheckCompositionRequirementForHXRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;

		if (header == "COMPOSITION")
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
		else if (header == "DUTY BLH RANGE") {
			_dutyBlhRange = headeValue;
			parseRange(headeValue, _dutyBlhLower, _dutyBlhUpper);
		}
		else if (header == "SCH FLT WINDOW RANGE") {
			_schFltWindowRange = headeValue;
			parseRange(headeValue, _schFltWindowLower, _schFltWindowUpper);
		}
		else if (header == "SECTOR BLH RANGE") {
			_sectorBlhRange = headeValue;
			parseRange(headeValue, _sectorBlhLower, _sectorBlhUpper);
		}
		else if (header == "COMPOSITION REQUIREMENT")
			_compositionRequirement = headeValue;
		else if (header == "PRECEDING REST RANGE") {
			_precedingRestRange = headeValue;
			parseRange(headeValue, _precedingRestLower, _precedingRestUpper);
		}
	}
}

void CheckCompositionRequirementForHXRuleParam::parseRange(const string& rangeStr, int& lower, int& upper) {
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