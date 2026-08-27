#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "CheckMaxConsecutiveEarlyStartRuleParam.h"
#include "CrewDB.h"

using namespace std;

void CheckMaxConsecutiveEarlyStartRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;

		if (header == "ALLOWED CONSECUTIVE TIMES")
			_allowedConsecutiveTimes = atoi(headeValue.c_str());
		else if (header == "FIRST MAX CONSECUTIVE TIMES")
			_firstMaxConsecutiveTimes = atoi(headeValue.c_str());
		else if (header == "FIRST REDUCE FDP TIME")
			_firstReduceFDPTime = stoi(headeValue.substr(0, headeValue.find(":"))) * 60 + stoi(headeValue.substr(headeValue.find(":") + 1));
		else if (header == "SECOND MAX CONSECUTIVE TIMES")
			_secondMaxConsecutiveTimes = atoi(headeValue.c_str());
		else if (header == "SECOND REDUCE FDP TIME")
			_secondReduceFDPTimes = stoi(headeValue.substr(0, headeValue.find(":"))) * 60 + stoi(headeValue.substr(headeValue.find(":") + 1));
		else if (header == "NOT EARLIER THAN")
			_notEarlierThan = stoi(headeValue.substr(0, headeValue.find(":"))) * 60 + stoi(headeValue.substr(headeValue.find(":") + 1));
	}
}

