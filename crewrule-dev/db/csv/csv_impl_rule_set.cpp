#include <sstream>
#include <string.h>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void ruleSetParser::init(vector<string>& headers) {}

string ruleSetParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	RuleSet * ref = (RuleSet *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "worksetId") { ss << ref->worksetId << "^"; }
		else if (headers[i] == "ruleId") { ss << ref->ruleId << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else { logUnkonwnField("ruleSet", headers[i]); }
	}
	return ss.str();
}

void ruleSetParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	RuleSet * ref = (RuleSet *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "worksetId") { ref->worksetId = atoll(value); }
	else if (headers[index] == "ruleId") { ref->ruleId = atoll(value); }
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else { logUnkonwnField("ruleSet", headers[index]); }
}

void* ruleSetParser::createInstance() {
	return new RuleSet();
}

void ruleSetParser::deleteInstance(void* obj) {
	delete (RuleSet*)obj;
}

static vector<string> ruleSetDefaultHeaders = { "id", "worksetId", "ruleId", "lastModified", "modifiedBy"};
vector<string>& ruleSetParser::getDefaultHeaders() {
	return ruleSetDefaultHeaders;
}