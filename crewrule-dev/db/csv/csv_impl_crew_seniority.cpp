#include <sstream>
#include <string.h>
#include "../CrewDB.h"
#include "UtilFunc.h"
#include "csv_impl.h"

void crewSeniorityParser::init(vector<string>& headers) {}


string crewSeniorityParser::toCsv(vector<string>& headers, void* obj) {
	//"id", "crewId", "", "effDt", "expDt
	stringstream ss;
	CREW_SENIORITY* ref = (CREW_SENIORITY*)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << "^"; }
		else if (headers[i] == "crewId") { ss << ref->idCrew << "^"; }
		else if (headers[i] == "serviceDay") { ss << ref->serviceDay << "^"; }
		else if (headers[i] == "seniority") { ss << ref->seniority << "^"; }
		else { logUnkonwnField("CREW_SENIORITY", headers[i]); }
	}
	return ss.str();
}

void crewSeniorityParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	CREW_SENIORITY* ref = (CREW_SENIORITY*)obj;

	if (headers[index] == "id") {}
	else if (headers[index] == "crewId") { ref->idCrew = value; }
	else if (headers[index] == "serviceDay") { ref->serviceDay = atoi(value); }
	else if (headers[index] == "seniority") { ref->seniority = atof(value); }
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else { logUnkonwnField("CREW_SENIORITY", headers[index]); }
}

void* crewSeniorityParser::createInstance() {
	return new CREW_SENIORITY();
}

void crewSeniorityParser::deleteInstance(void* obj) {
	delete (CREW_SENIORITY*)obj;
}

static vector<string> crewFleetDefaultHeaders = { "id", "crewId", "serviceDay", "seniority" };
vector<string>& crewSeniorityParser::getDefaultHeaders() {
	return crewFleetDefaultHeaders;
}