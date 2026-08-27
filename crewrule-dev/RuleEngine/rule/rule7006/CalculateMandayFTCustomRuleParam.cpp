#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "CalculateMandayFTCustomRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"

using namespace std;

void CalculateMandayFTCustomRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;

		if (header == "DIVISION")
			_division = headeValue;
		else if (header == "FLIGHT TIME START")
			_flightTimeStart = headeValue == "*" ? -1 : TimeUtils::hhmmToMinutes(headeValue);
		else if (header == "FLIGHT TIME END")
			_flightTimeEnd = headeValue == "*" ? -1 : TimeUtils::hhmmToMinutes(headeValue);
		else if (header == "COMPOSITION")
			_composition = headeValue;
		else if (header == "SEGMENT ASSIGNMENTS")
			split(headeValue, '|', _assignments);
		else if (header == "PERCENT")
			_percent = atof(headeValue.c_str());
	}
}
