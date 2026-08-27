#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "MaxFlightDutyPeriodRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "constant//Constants.h"

using namespace std;

void MaxFlightDutyPeriodRuleParam::ParseParam(const DBRule& dbRule) {
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
		else if (header == "LANDING LOWER")
			_landingLower = atoi(headeValue.c_str());
		else if (header == "LANDINGS UPPER")
			_landingUpper = atoi(headeValue.c_str());
		else if (header == "MAX FDP")
			_maxFdp = TimeUtils::hhmmToMinutes(headeValue);
		else if (header == "ODP START")
			_odpLower = TimeUtils::hhmmToMinutes(headeValue);
		else if (header == "ODP END")
			_odpUpper = TimeUtils::hhmmToMinutes(headeValue);
		else if (header == "LANDING ASSIGNMENTS")
			split(headeValue, '|', _landingAssignments);
		else if (header == "OVERRIDE DUTY ATTRIBUTES")
			split(headeValue, '|', _overrideDutyAttributes);
		else if (header == "MAX FDP EXTENSION") {
			if (headeValue != RuleParamConstant::ALL)
			_maxFdpExtension = TimeUtils::hhmmToMinutes(headeValue);
		}
	}
}

bool MaxFlightDutyPeriodRuleParam::MatchDutyAttributes(const Duty* duty) const {
	if (_overrideDutyAttributes.empty() || _overrideDutyAttributes[0] == "*" || _overrideDutyAttributes[0].empty())
		return true;

	vector<string> dutyAttributes;
	const auto& dutyAttributesStr = duty->getAttributes();
	split(dutyAttributesStr, '|', dutyAttributes);
	for (const auto& attr : _overrideDutyAttributes) {
		if (find(dutyAttributes.begin(), dutyAttributes.end(), attr) != dutyAttributes.end())
			return true;
	}

	return false;
}

