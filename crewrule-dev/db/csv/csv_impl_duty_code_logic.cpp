#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void dutyCodeLogicParser::init(vector<string>& headers) {}


static vector<string> dutyCodeLogicDefaultHeaders = { "id", "dutyCodeTypeCompId", "pairComp", "dep", "arr", "isSingleSeg", "dutyCodeType", "dutyCode", "priority", "modifiedBy", "lastModified" };
vector<string>& dutyCodeLogicParser::getDefaultHeaders() {
	return dutyCodeLogicDefaultHeaders;
}

void* dutyCodeLogicParser::createInstance() {
	return new DutyCodeLogic();
}

void dutyCodeLogicParser::deleteInstance(void* obj) {
	delete (DutyCodeLogic*)obj;
}

string dutyCodeLogicParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	DutyCodeLogic* ref = (DutyCodeLogic*)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "dutyCodeTypeCompId") { ss << ref->dutyCodeTypeCompId << "^"; }
		else if (headers[i] == "pairComp") { ss << ref->pairComp << "^"; }
		else if (headers[i] == "dep") { ss << ref->dep << "^"; }
		else if (headers[i] == "arr") { ss << ref->arr << "^"; }
		else if (headers[i] == "isSingleSeg") { ss << (ref->isSingleSeg ? "Y" : "N") << "^"; }
		else if (headers[i] == "dutyCodeType") { ss << ref->dutyCodeType << "^"; }
		else if (headers[i] == "dutyCode") { ss << ref->dutyCode << "^"; }
		else if (headers[i] == "priority") { ss << ref->priority << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("dutyCodeLogic", headers[i]); }
	}
	return ss.str();
}

void dutyCodeLogicParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	DutyCodeLogic* ref = (DutyCodeLogic*)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "dutyCodeTypeCompId") { ref->dutyCodeTypeCompId = atoll(value); }
	else if (headers[index] == "pairComp") { ref->pairComp = value; }
	else if (headers[index] == "dep") { ref->dep = value; }
	else if (headers[index] == "arr") { ref->arr = value; }
	else if (headers[index] == "isSingleSeg") { ref->isSingleSeg = (0 == memcmp(value, "Y", 1) ? true : false);	}
	else if (headers[index] == "dutyCodeType") { ref->dutyCodeType = value; }
	else if (headers[index] == "dutyCode") { ref->dutyCode = value; }
	else if (headers[index] == "priority") { ref->priority = atoi(value); }
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else { logUnkonwnField("dutyCodeLogic", headers[index]); }
}

