#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "MaxFlightDutyTimeRuleParam.h"
#include "CrewDB.h"

using namespace std;

void MaxFlightDutyTimeRuleParam::ParseParam(const DBRule& dbRule) {
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
			_maxFdp = stoi(headeValue.substr(0, headeValue.find(":"))) * 60 + stoi(headeValue.substr(headeValue.find(":") + 1));
		else if (header == "MAX DP")
			_maxDp = stoi(headeValue.substr(0, headeValue.find(":"))) * 60 + stoi(headeValue.substr(headeValue.find(":") + 1));
		else if (header == "MAX FT")
			_maxFt = stoi(headeValue.substr(0, headeValue.find(":"))) * 60 + stoi(headeValue.substr(headeValue.find(":") + 1));
		else if (header == "MAX EXTENSION")
			_maxExtension = stoi(headeValue.substr(0, headeValue.find(":"))) * 60 + stoi(headeValue.substr(headeValue.find(":") + 1));
		else if (header == "REST FACILITY")
			_restFacility = headeValue;
	}
}

