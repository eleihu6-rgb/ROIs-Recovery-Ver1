#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void fatigueResultParser::init(vector<string>& headers) {}


static vector<string> fatigueResultDefaultHeaders = { "id", "dutyStart", "dutyEnd", "fatigueIndex", "rosterId", "dutyId", "maxTod", "maxSp", "firstSleepStart", "firstSleepEnd", "secondSleepStart", "secondSleepEnd", "lastModified", "modifiedBy"};
vector<string>& fatigueResultParser::getDefaultHeaders() {
	return fatigueResultDefaultHeaders;
}

void* fatigueResultParser::createInstance() {
	return new FatigueResult();
}

void fatigueResultParser::deleteInstance(void* obj) {
	delete (FatigueResult*)obj;
}

string fatigueResultParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	FatigueResult* ref = (FatigueResult*)obj;
	//"id", "", "", "", ""
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "dutyStart") { ss << ref->dutyStart << "^"; }
		else if (headers[i] == "dutyEnd") { ss << ref->dutyEnd << "^"; }
		else if (headers[i] == "fatigueIndex") { ss << ref->fatigueIndex << "^"; }
		else if (headers[i] == "maxTod") { ss << ref->maxTod << "^"; }
		else if (headers[i] == "maxSp") { ss << ref->maxSp << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else { logUnkonwnField("FatigueResult", headers[i]); }
	}
	return ss.str();
}

void fatigueResultParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	FatigueResult* ref = (FatigueResult*)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "dutyStart") { ref->dutyStart = utcStrToUtc(value); }
	else if (headers[index] == "dutyEnd") { ref->dutyEnd = utcStrToUtc(value); }
	else if (headers[index] == "fatigueIndex") { ref->fatigueIndex = value; }
	else if (headers[index] == "maxTod") { ref->maxTod = value; }
	else if (headers[index] == "maxSp") { ref->maxSp = value; }
	else if (headers[index] == "rosterId") { ref->rosterId = atoll(value); }
	else if (headers[index] == "dutyId") { ref->dutyId = atoll(value); }
	else if (headers[index] == "crewId") { ref->crewId = value; }
	else if (headers[index] == "body") {}
	else if (headers[index] == "marketAcType") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else { logUnkonwnField("FatigueResult", headers[index]); }
}

