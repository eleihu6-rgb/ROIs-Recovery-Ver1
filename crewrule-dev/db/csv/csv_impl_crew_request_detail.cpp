#include <sstream>
#include "Segment.h"
#include "UtilFunc.h"
#include "CrewDB.h"
#include "csv_impl.h"
#include "JsonLive.h"
//#include "rapidjson\document.h"		// rapidjson's DOM-style API

using namespace rapidjson;

static vector<string> crewRequestDetailDefaultHeaders = { "id", "reqId", "crewId", "startDate", "endDate", "buddyCrewId", "type", "pairingId", "rosterId", "priority", "status", "reason", "remark",
															"assignment", "attributes", "createdDt", "createdBy", "lastModified", "modifiedBy" };
vector<string>& crewRequestDetailParser::getDefaultHeaders() {
	return crewRequestDetailDefaultHeaders;
}

void crewRequestDetailParser::init(vector<string>& headers) {}

void* crewRequestDetailParser::createInstance() {
	return new CREW_REQUEST_DETAIL();
}

void crewRequestDetailParser::deleteInstance(void* obj) {
	delete (CREW_REQUEST_DETAIL*)obj;
}

string crewRequestDetailParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	CREW_REQUEST_DETAIL * ref = (CREW_REQUEST_DETAIL *)obj;
	//"", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "reqId") { ss << ref->reqId << "^"; }
		else if (headers[i] == "crewId") { ss << ref->crewId << "^"; }
		else if (headers[i] == "startDate") { ss << ref->startDateLocalStr << "^"; }
		else if (headers[i] == "endDate") { ss << ref->endDateLocalStr << "^"; }
		else if (headers[i] == "buddyCrewId") { ss << ref->buddyCrewId << "^"; }
		else if (headers[i] == "type") { ss << ref->type << "^"; }
		else if (headers[i] == "pairingId") { ss << ref->pairingId << "^"; }
		else if (headers[i] == "rosterId") { ss << ref->rosterId << "^"; }
		else if (headers[i] == "priority") { ss << ref->priority << "^"; }
		else if (headers[i] == "status") { ss << ref->status << "^"; }
		else if (headers[i] == "reason") { ss << ref->reason << "^"; }
		else if (headers[i] == "remark") { ss << ref->remark << "^"; }
		else if (headers[i] == "assignment") { ss << ref->assignment << "^"; }
		else if (headers[i] == "attributes") { ss << ref->attributes << "^"; }
		else if (headers[i] == "createdDt") { ss << utcToUtcDtString(ref->createdDt) << "^"; }
		else if (headers[i] == "createdBy") { ss << ref->createdBy << "^"; }
		else if (headers[i] == "lastModified") { ss << utcToUtcDtString(ref->lastModified) << "^"; }
		else if (headers[i] == "modifiedBy") { ss << ref->modifiedBy << "^"; }
		else { logUnkonwnField("crew_request_detail", headers[i]); }
	}
	return ss.str();
}

void crewRequestDetailParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	CREW_REQUEST_DETAIL * ref = (CREW_REQUEST_DETAIL *)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "reqId") { ref->reqId = atoll(value); }
	else if (headers[index] == "crewId") { ref->crewId = value; }
	else if (headers[index] == "startDate") { ref->startDateLocalStr = value; }
	else if (headers[index] == "endDate") { ref->endDateLocalStr = value; }
	else if (headers[index] == "buddyCrewId") { ref->buddyCrewId = value; }
	else if (headers[index] == "type") { ref->type = value; }
	else if (headers[index] == "pairingId") { ref->pairingId = atoll(value); }
	else if (headers[index] == "rosterId") { ref->rosterId = atoll(value); }
	else if (headers[index] == "priority") { ref->priority = value; }
	else if (headers[index] == "status") { ref->status = value; }
	else if (headers[index] == "reason") { ref->reason = value; }
	else if (headers[index] == "remark") { ref->remark = value; }
	else if (headers[index] == "assignment") { ref->assignment = value; }
	else if (headers[index] == "attributes") { ref->attributes = value; }
	else if (headers[index] == "createdDt") { ref->createdDt = utcStrToUtc(value); }
	else if (headers[index] == "createdBy") { ref->createdBy = value; }
	else if (headers[index] == "lastModified") { ref->lastModified = utcStrToUtc(value); }
	else if (headers[index] == "modifiedBy") { ref->modifiedBy = value; }
	else { logUnkonwnField("crew_request_detail", headers[index]); }
}

