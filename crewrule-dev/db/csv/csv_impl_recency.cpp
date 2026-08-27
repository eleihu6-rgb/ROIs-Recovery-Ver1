#include <sstream>
#include "UtilFunc.h"
#include "../RecencyMgr.h"
#include "csv_impl.h"

static vector<string> recencyHeaders = { "scenarioId", "crewId", "type", "code", "effDt", "expDt", "crewBaseDt", "depArp", "arvArp", "operation", "status", "approach", "unit", "times", "fleet", "actingRank", "role", "rosterId", "trainingId", "remark", "modifiedBy", "lastModified" };
vector<string>& recencyParser::getDefaultHeaders() {
	return recencyHeaders;
}

void recencyParser::init(vector<string>& headers) {}

void* recencyParser::createInstance() {
	return new CrewRecency();
}

void recencyParser::deleteInstance(void* obj) {
	delete (CrewRecency*)obj;
}

string recencyParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	CrewRecency * ref = (CrewRecency *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << "^"; }
		else if (headers[i] == "scenarioId") { ss << ref->scenarioId << "^"; }
		else if (headers[i] == "crewId") { ss << ref->idcrew << "^"; }
		else if (headers[i] == "crewBaseDt") { ss << utcToUtcDtString(ref->crewDateLoc) << "^"; }
		else if (headers[i] == "depArp") { ss << ref->depAirport << "^"; }
		else if (headers[i] == "arvArp") { ss << ref->arvAirport << "^"; }
		else if (headers[i] == "operation") { ss << ref->operate << "^"; }
		else if (headers[i] == "status") { ss << ref->status << "^"; }
		else if (headers[i] == "approach") { ss << ref->approach << "^"; }
		else if (headers[i] == "unit") { ss << ref->unit << "^"; }
		else if (headers[i] == "times") { ss << ref->times << "^"; }
		else if (headers[i] == "fleet") { ss << ref->fleet << "^"; }
		else if (headers[i] == "actingRank") { ss << ref->actingRank << "^"; }
		else if (headers[i] == "role") { ss << ref->role << "^"; }
		else if (headers[i] == "rosterId") { ss << ref->rosterId << "^"; }
		else if (headers[i] == "trainingId") { ss << ref->trainingId << "^"; }
		else if (headers[i] == "remark") { ss << ref->remark << "^"; }
		else if (headers[i] == "modifiedBy") { ss << ref->iduser << "^"; }
		else if (headers[i] == "lastModified") { ss << ref->tmst << "^"; }
		else { logUnkonwnField("recency", headers[i]); }
	}
	return ss.str();
}

void recencyParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	CrewRecency * ref = (CrewRecency *)obj;
	if (headers[index] == "id") {}
	else if (headers[index] == "scenarioId") { ref->scenarioId = atoll(value); }
	else if (headers[index] == "crewId") { ref->idcrew = value; }
	else if (headers[index] == "crewBaseDt") { ref->crewDateLoc = utcStrToUtc(value); }
	else if (headers[index] == "type") { ref->type = value; }
	else if (headers[index] == "code") { ref->code = value; }
	else if (headers[index] == "effDt") { ref->effDt = utcStrToUtc(value); }
	else if (headers[index] == "expDt") { ref->expDt = utcStrToUtc(value); }
	else if (headers[index] == "depArp") { ref->depAirport = value; }
	else if (headers[index] == "arvArp") { ref->arvAirport = value; }
	else if (headers[index] == "operation") { ref->operate = value; }
	else if (headers[index] == "status") { ref->status = value; }
	else if (headers[index] == "approach") { ref->approach = value; }
	else if (headers[index] == "unit") { ref->unit = value; }
	else if (headers[index] == "times") { ref->times = atoi(value); }
	else if (headers[index] == "fleet") { ref->fleet = value; }
	else if (headers[index] == "actingRank") { ref->actingRank = value; }
	else if (headers[index] == "role") { ref->role = value; }
	else if (headers[index] == "rosterId") { ref->rosterId = atoll(value); }
	else if (headers[index] == "trainingId") { ref->trainingId = atoll(value); }
	else if (headers[index] == "remark") { ref->remark = value; }
	else if (headers[index] == "qualification") { }
	else if (headers[index] == "recencyType") { }
	else if (headers[index] == "qualExpDay") { }
	else if (headers[index] == "assignments") { }
	else if (headers[index] == "attributes") { }
	else if (headers[index] == "minPtns") { }
	else if (headers[index] == "space") { }
	else if (headers[index] == "modifiedBy") { ref->iduser = value; }
	else if (headers[index] == "lastModified") { ref->tmst = utcStrToUtc(value); }
	else { logUnkonwnField("recency", headers[index]); }
}

