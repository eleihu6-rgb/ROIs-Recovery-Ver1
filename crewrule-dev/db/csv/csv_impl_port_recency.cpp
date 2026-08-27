#include <sstream>
#include "UtilFunc.h"
#include "../RecencyMgr.h"
#include "csv_impl.h"

static vector<string> portRecencyHeaders = { "id", "crewId", "qualification", "airport", "effDt", "expDt", "lastModified", "modifiedBy"};
vector<string>& portRecencyParser::getDefaultHeaders() {
	return portRecencyHeaders;
}

void portRecencyParser::init(vector<string>& headers) {}

void* portRecencyParser::createInstance() {
	return new CrewPortRecency();
}

void portRecencyParser::deleteInstance(void* obj) {
	delete (CrewPortRecency*)obj;
}

string portRecencyParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	CrewPortRecency * ref = (CrewPortRecency *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << "^"; }
		else if (headers[i] == "crewId") { ss << ref->crewId << "^"; }
		else if (headers[i] == "qualification") { ss << ref->qualification << "^"; }
		else if (headers[i] == "airport") { ss << ref->airport << "^"; }
		else if (headers[i] == "effDt") { ss << utcToUtcDtString(ref->effDt) << "^"; }
		else if (headers[i] == "expDt") { ss << utcToUtcDtString(ref->expDt) << "^"; }
		else if (headers[i] == "lastModified") { ss << utcToUtcDtString(ref->lastModified) << "^"; }
		else if (headers[i] == "modifiedBy") { ss << ref->modifiedBy << "^"; }
		else { logUnkonwnField("port_recency", headers[i]); }
	}
	return ss.str();
}

void portRecencyParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	CrewPortRecency * ref = (CrewPortRecency *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "crewId") { ref->crewId = value; }
	else if (headers[index] == "qualification") { ref->qualification = value; }
	else if (headers[index] == "airport") { ref->airport = value; }
	else if (headers[index] == "effDt") { ref->effDt = utcStrToUtc(value); }
	else if (headers[index] == "expDt") { ref->expDt = utcStrToUtc(value); }
	else if (headers[index] == "lastModified") { ref->lastModified = utcStrToUtc(value); }
	else if (headers[index] == "modifiedBy") { ref->modifiedBy = value; }
	else { logUnkonwnField("port_recency", headers[index]); }
}

