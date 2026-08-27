#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void crewProfileParser::init(vector<string>& headers) {}


static vector<string> crewProfileDefaultHeaders = { "id", "crewId", "profile", "type", "effDt", "expDt" };
vector<string>& crewProfileParser::getDefaultHeaders() {
	return crewProfileDefaultHeaders;
}

void* crewProfileParser::createInstance() {
	return new CREW_PROFILE();
}

void crewProfileParser::deleteInstance(void* obj) {
	delete (CREW_PROFILE*)obj;
}

string crewProfileParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	CREW_PROFILE * ref = (CREW_PROFILE *)obj;
	//"", "", "", "", "", "", "", "", "", "", ""
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "crewId") { ss << ref->crewId << "^"; }
		else if (headers[i] == "profile") { ss << ref->profile << "^"; }
		else if (headers[i] == "type") { ss << ref->type << "^"; }
		else if (headers[i] == "effDt") { ss << ref->effDt << "^"; }
		else if (headers[i] == "expDt") { ss << ref->expDt << "^"; }

		else { logUnkonwnField("crew_profile", headers[i]); }
	}
	return ss.str();
}

void crewProfileParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	CREW_PROFILE * ref = (CREW_PROFILE *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "crewId") { ref->crewId = value; }
	else if (headers[index] == "profile") { ref->profile = value; }
	else if (headers[index] == "type") { ref->type = value; }
	else if (headers[index] == "effDt") { ref->effDt = utcStrToUtc(value); }
	else if (headers[index] == "expDt") { ref->expDt = utcStrToUtc(value); }

	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else { logUnkonwnField("crew_profile", headers[index]); }
}

