#include <sstream>
#include "UtilFunc.h"
#include "../RecencyMgr.h"
#include "csv_impl.h"

static vector<string> recencyRulesHeaders = { "id", "recencyType", "qualification", "qualExpDay", "assignments", "attributes", "minPtns", "space"};
vector<string>& recencyRulesParser::getDefaultHeaders() {
	return recencyRulesHeaders;
}

void recencyRulesParser::init(vector<string>& headers) {}

void* recencyRulesParser::createInstance() {
	return new CrewRecencyRules();
}

void recencyRulesParser::deleteInstance(void* obj) {
	delete (CrewRecencyRules*)obj;
}

string recencyRulesParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	CrewRecencyRules * ref = (CrewRecencyRules *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "recencyType") { ss << ref->recencyType << "^"; }
		else if (headers[i] == "qualification") { ss << ref->qualification << "^"; }
		else if (headers[i] == "qualExpDay") { ss << ref->qualExpDay << "^"; }
		else if (headers[i] == "assignments") { ss << ref->assignments << "^"; }
		else if (headers[i] == "attributes") { ss << ref->attributes << "^"; }
		else if (headers[i] == "minPtns") { ss << ref->minPtns << "^"; }
		else if (headers[i] == "space") { ss << ref->space << "^"; }
		else if (headers[i] == "byRank") { ss << ref->byRank << "^"; }
		else { logUnkonwnField("crew_recency_rules", headers[i]); }
	}
	return ss.str();
}

void recencyRulesParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	CrewRecencyRules * ref = (CrewRecencyRules *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "recencyType") { ref->recencyType = value; }
	else if (headers[index] == "qualification") { ref->qualification = value; }
	else if (headers[index] == "qualExpDay") { ref->qualExpDay = atoi(value); }
	else if (headers[index] == "assignments") { ref->assignments = value; }
	else if (headers[index] == "attributes") { ref->attributes = value; }
	else if (headers[index] == "minPtns") { ref->minPtns = atoi(value); }
	else if (headers[index] == "space") { ref->space = atoi(value); }
	else if (headers[index] == "byRank") { ref->byRank = (std::string(value) == "Y" ? true : false); }
	else { logUnkonwnField("crew_recency_rules", headers[index]); }
}

