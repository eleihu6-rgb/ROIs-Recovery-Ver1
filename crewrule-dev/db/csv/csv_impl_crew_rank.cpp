#include <sstream>
#include <string.h>
#include "../CrewDB.h"
#include "UtilFunc.h"
#include "csv_impl.h"

void crewRankParser::init(vector<string>& headers) {}


string crewRankParser::toCsv(vector<string>& headers, void* obj) {
	//"", "", "", "", "", "
	stringstream ss;
	CREW_RANK * ref = (CREW_RANK *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << "^"; }
		else if (headers[i] == "crewId") { ss << ref->idCrew << "^"; }
		else if (headers[i] == "rank") { ss << ref->rank << "^"; }
		else if (headers[i] == "probationEndDt") { ss << utcToUtcTzString(ref->probationEndUtc) << "^"; }
		else if (headers[i] == "effDt") { ss << utcToUtcTzString(ref->effUtc) << "^"; }
		else if (headers[i] == "expDt") { ss << utcToUtcTzString(ref->expUtc) << "^"; }
		else if (headers[i] == "position") { ss << ref->position << "^"; }
		else if (headers[i] == "preCumulatedExpDays") { ss << ref->preCumulatedExpDays << "^"; }
		else if (headers[i] == "fleetSpecific") { ss << ref->fleetGroup << "^"; }
		else if (headers[i] == "acType") { ss << ref->acType << "^"; }
		else if (headers[i] == "displayPosition") { ss <<  "^"; }
		else if (headers[i] == "interfaceId") { ss << "^"; }
		else { logUnkonwnField("crew_rank", headers[i]); }
	}
	return ss.str();
}

void crewRankParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	CREW_RANK * ref = (CREW_RANK *)obj;

	if (headers[index] == "id") { }
	else if (headers[index] == "crewId") { ref->idCrew = value; }
	else if (headers[index] == "division") { ref->division = value; }
	else if (headers[index] == "rank") { ref->rank = value; }
	else if (headers[index] == "probationEndDt") { ref->probationEndUtc = utcStrToUtc(value); }
	else if (headers[index] == "effDt") { ref->effUtc = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "expDt") { ref->expUtc = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "position") { ref->position = value; }
	else if (headers[index] == "preCumulatedExpDays") { ref->preCumulatedExpDays = atoi(value); }
	else if (headers[index] == "fleetSpecific" || headers[index] == "fleetGrp") { ref->fleetGroup = value; }
	else if (headers[index] == "acType") { ref->acType = value; }
	else if (headers[index] == "displayPosition") {}
	else if (headers[index] == "interfaceCrewRankId") {}
	else if (headers[index] == "interfaceId") {}
	else if (headers[index] == "companyRank") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else { logUnkonwnField("crew_rank", headers[index]); }
}

void* crewRankParser::createInstance() {
	return new CREW_RANK();
}

void crewRankParser::deleteInstance(void* obj) {
	delete (CREW_RANK*)obj;
}

static vector<string> crewRankDefaultHeaders = { "id", "crewId", "rank", "acType", "probationEndDt", "effDt", "expDt", "position", "preCumulatedExpDays", "fleetSpecific" ,"displayPosition"};
vector<string>& crewRankParser::getDefaultHeaders() {
	return crewRankDefaultHeaders;
}