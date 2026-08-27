#include <sstream>
#include <string.h>
#include "../CrewDB.h"
#include "UtilFunc.h"
#include "csv_impl.h"

void crewTeamParser::init(vector<string>& headers) {}


string crewTeamParser::toCsv(vector<string>& headers, void* obj) {
	//"", "", "", "", "", "", "
	stringstream ss;
	CREW_TEAM * ref = (CREW_TEAM *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << "^"; }
		else if (headers[i] == "teamId") { ss << ref->team_id << "^"; }
		else if (headers[i] == "crewId") { ss << ref->idcrew << "^"; }
		else if (headers[i] == "role") { ss << ref->role << "^"; }
		else if (headers[i] == "minInstructingHours") { ss << ref->minInstructingHour << "^"; }
		else if (headers[i] == "effDt") { ss << utcToUtcTzString(ref->effDt) << "^"; }
		else if (headers[i] == "expDt") { ss << utcToUtcTzString(ref->expDt) << "^"; }
		else if (headers[i] == "team") { ss << ref->teamName << "^"; }
		//else { logUnkonwnField("crew_team", headers[i]); }
	}
	return ss.str();
}

void crewTeamParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	CREW_TEAM * ref = (CREW_TEAM *)obj;

	if (headers[index] == "id") {  }
	else if (headers[index] == "teamId") { ref->team_id = atoll(value); }
	else if (headers[index] == "crewId") { ref->idcrew = value; }
	else if (headers[index] == "role") { ref->role = value; }
	else if (headers[index] == "minInstructingHours") { ref->minInstructingHour = atoi(value); }
	else if (headers[index] == "effDt") { ref->effDt = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "expDt") { ref->expDt = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "team") { ref->teamName = value; }
	else if (headers[index] == "isValid") { ref->isValid = strcmp(value, "true") == 0; }
	else if (headers[index] == "remarks") { }
	else if (headers[index] == "source") { }
	else if (headers[index] == "teamTaskId") { }

	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else { logUnkonwnField("crew_team", headers[index]); }
}

void* crewTeamParser::createInstance() {
	return new CREW_TEAM();
}

void crewTeamParser::deleteInstance(void* obj) {
	delete (CREW_TEAM*)obj;
}

static vector<string> crewTeamDefaultHeaders = { "id", "teamId", "crewId", "role", "minInstructingHours", "effDt", "expDt", "team" };
vector<string>& crewTeamParser::getDefaultHeaders() {
	return crewTeamDefaultHeaders;
}