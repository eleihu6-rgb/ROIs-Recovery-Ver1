#include <sstream>
#include <string.h>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void portQualReqmntParser::init(vector<string>& headers) {}


string portQualReqmntParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	DBPortQualReqmnts * ref = (DBPortQualReqmnts *)obj;
	//"", "", "", "", "", "", "", "", "", "", "", "", "", ""
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << "^"; }
		else if (headers[i] == "airline") { ss << ref->airline << "^"; }
		else if (headers[i] == "airport") { ss << ref->airport << "^"; }
		else if (headers[i] == "division") { ss << ref->division << "^"; }
		else if (headers[i] == "crewGroup") { ss << ref->crewGroup << "^"; }
		else if (headers[i] == "fltNum") { ss << ref->fltNum << "^"; }
		else if (headers[i] == "fleet") { ss << ref->fleet << "^"; }
		else if (headers[i] == "rank") { ss << ref->rank << "^"; }
		else if (headers[i] == "qual") { ss << ref->qual << "^"; }
		else if (headers[i] == "startTime") { ss << ref->startTime << "^"; }
		else if (headers[i] == "endTime") { ss << ref->endTime << "^"; }
		else if (headers[i] == "inOutInd") { ss << ref->inOutInd << "^"; }
		else if (headers[i] == "effDt") { ss << utcToUtcTzString(ref->effLocal) << "^"; }
		else if (headers[i] == "expDt") { ss << utcToUtcTzString(ref->expLocal) << "^"; }
		else if (headers[i] == "exceptionCode") { ss << ref->exceptionCode << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "filiale") { ss << "^"; }
		else { logUnkonwnField("port_qual_reqmnt", headers[i]); }
	}
	return ss.str();
}

void portQualReqmntParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	DBPortQualReqmnts * ref = (DBPortQualReqmnts *)obj;
	if (headers[index] == "id") { }
	else if (headers[index] == "airline") { strncpy(ref->airline, value, sizeof(ref->airline)); }
	else if (headers[index] == "airport") { strncpy(ref->airport, value, sizeof(ref->airport)); }
	else if (headers[index] == "division") { strncpy(ref->division, value, sizeof(ref->division));; }
	else if (headers[index] == "crewGroup") { strncpy(ref->crewGroup, value, sizeof(ref->crewGroup));; }
	else if (headers[index] == "fltNum") { strncpy(ref->fltNum, value, sizeof(ref->fltNum));; }
	else if (headers[index] == "fleet") { strncpy(ref->fleet, value, sizeof(ref->fleet));; }
	else if (headers[index] == "rank") { strncpy(ref->rank, value, sizeof(ref->rank));; }
	else if (headers[index] == "qual") { strncpy(ref->qual, value, sizeof(ref->qual));; }
	else if (headers[index] == "startTime") { strncpy(ref->startTime, value, sizeof(ref->startTime));; }
	else if (headers[index] == "endTime") { strncpy(ref->endTime, value, sizeof(ref->endTime));; }
	else if (headers[index] == "inOutInd") { strncpy(ref->inOutInd, value, sizeof(ref->inOutInd));; }
	else if (headers[index] == "effDt") { ref->effLocal = utcStrToUtc(value); }
	else if (headers[index] == "expDt") { ref->expLocal = utcStrToUtc(value); }
	else if (headers[index] == "exceptionCode") { strncpy(ref->exceptionCode, value, sizeof(ref->exceptionCode));; }
	else if (headers[index] == "qualLevel") { ref->level = atoi(value); }
	else if (headers[index] == "segTypes") { strncpy(ref->segType, value, sizeof(ref->segType));; }
	else if (headers[index] == "isRestricted") { ref->isRestricted = std::string(value) == "Y"; }
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "filiale") {}
	else { logUnkonwnField("port_qual_reqmnt", headers[index]); }
}

void* portQualReqmntParser::createInstance() {
	return new DBPortQualReqmnts();
}

void portQualReqmntParser::deleteInstance(void* obj) {
	delete (DBPortQualReqmnts*)obj;
}

static vector<string> flightCompositionDefaultHeaders = { "id", "airline", "airport", "division", "crewGroup", "fltNum",
"fleet", "rank", "qual", "startTime", "endTime", "inOutInd", "effDt", "expDt", "exceptionCode", "segTypes", "isRestricted", "lastModified", "modifiedBy", "filiale" };
vector<string>& portQualReqmntParser::getDefaultHeaders() {
	return flightCompositionDefaultHeaders;
}