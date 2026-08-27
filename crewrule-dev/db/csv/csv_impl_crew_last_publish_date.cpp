#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void crewLastPublishDateParser::init(vector<string>& headers) {}


static vector<string> crewLastPublishDateDefaultHeaders = { "crewId", "lastPublishDate"};
vector<string>& crewLastPublishDateParser::getDefaultHeaders() {
	return crewLastPublishDateDefaultHeaders;
}

void* crewLastPublishDateParser::createInstance() {
	return new CrewLastPublishDate();
}

void crewLastPublishDateParser::deleteInstance(void* obj) {
	delete (CrewLastPublishDate*)obj;
}

string crewLastPublishDateParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	CrewLastPublishDate * ref = (CrewLastPublishDate *)obj;
	//"", "", "", "", "", "", "", "", "", "", ""
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "crewId") { ss << ref->crewId << "^"; }
		else if (headers[i] == "lastPublishDate") { ss << utcToUtcDtString(ref->lastPublishDate) << "^"; }
		else { logUnkonwnField("crew_last_publish_date", headers[i]); }
	}
	return ss.str();
}

void crewLastPublishDateParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	CrewLastPublishDate * ref = (CrewLastPublishDate *)obj;
	if (headers[index] == "crewId") { ref->crewId = value; }
	else if (headers[index] == "lastPublishDate") { ref->lastPublishDate = utcStrToUtc(value); }

	else { logUnkonwnField("crew_last_publish_date", headers[index]); }
}

