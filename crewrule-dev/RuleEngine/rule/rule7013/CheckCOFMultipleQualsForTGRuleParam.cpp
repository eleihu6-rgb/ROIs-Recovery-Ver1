#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "CheckCOFMultipleQualsForTGRuleParam.h"
#include "CrewDB.h"

using namespace std;

void CheckCOFMultipleQualsForTGRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		this->SetId(dbRule.idRule);
		this->SetRuleParamId(dbRule.idRuleParam);
		this->SetPhase(dbRule.phase);
		this->SetDescription(dbRule.description);
		header = iter->first;
		headeValue = iter->second;

		if (header == "BASES")
			split(headeValue, '|', _bases);
		else if (header == "RANKS")
			split(headeValue, '|', _ranks);
		else if (header == "FLEETS")
			split(headeValue, '|', _fleets);
		else if (header == "TEAMS")
			split(headeValue, '|', _teams);
		else if (header == "PILOT") {
			if (headeValue == "*")
				_pilot = 0;
			else
				_pilot = atoi(headeValue.c_str());

		}
		else if (header == "FLIGHT NUMBERS")
			split(headeValue, '|', _flightNumbers);
		else if (header == "FLIGHT ASSIGNMENTS")
			split(headeValue, '|', _flightAssignments);
		else if (header == "AIRPORTS")
			split(headeValue, '|', _airports);
		else if (header == "ATTRIBUTES")
			split(headeValue, '|', _attributes);
		else if (header == "ASSIGNMENTS")
			split(headeValue, '|', _assignments);
		else if (header == "ACTING RANKS")
			split(headeValue, '|', _actingRanks);
		else if (header == "QUALS")
			split(headeValue, '+', _quals);

	}
}

bool CheckCOFMultipleQualsForTGRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}